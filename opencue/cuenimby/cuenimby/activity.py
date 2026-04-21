#  Copyright Contributors to the OpenCue Project
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

"""User activity detection for CueNIMBY.

Detects mouse/keyboard input using pynput and fires callbacks when the user
becomes active (first input after idle) or returns to idle (no input for
idle_threshold seconds).

This runs in the user desktop session where pynput can access input events,
unlike the RQD Windows service which runs in Session 0.
"""

import logging
import threading
import time
from typing import Callable, List, Optional

logger = logging.getLogger(__name__)


class ActivityDetector:
    """Detects user activity via mouse and keyboard input.

    Fires on_activity callbacks on the first input event after an idle period,
    and on_idle callbacks once the user has been idle for idle_threshold seconds.
    """

    def __init__(self, idle_threshold: int = 900, check_interval: int = 10):
        """Initialize activity detector.

        Args:
            idle_threshold: Seconds of no input before declaring idle.
            check_interval: Seconds between idle checks.
        """
        self.idle_threshold = idle_threshold
        self.check_interval = check_interval

        self._last_activity_time: float = time.time()
        self._is_user_active: bool = False
        self._running: bool = False
        self._check_thread: Optional[threading.Thread] = None

        self._activity_callbacks: List[Callable[[], None]] = []
        self._idle_callbacks: List[Callable[[], None]] = []

        self._mouse_listener = None
        self._keyboard_listener = None

    def on_activity(self, callback: Callable[[], None]) -> None:
        """Register callback fired when user becomes active after idle.

        Args:
            callback: Function to call with no arguments.
        """
        self._activity_callbacks.append(callback)

    def on_idle(self, callback: Callable[[], None]) -> None:
        """Register callback fired when user has been idle for idle_threshold seconds.

        Args:
            callback: Function to call with no arguments.
        """
        self._idle_callbacks.append(callback)

    def _handle_input(self, *args) -> None:
        """Handle any mouse or keyboard input event."""
        self._last_activity_time = time.time()
        if not self._is_user_active:
            self._is_user_active = True
            logger.info("Activity detected — user is now active")
            for callback in self._activity_callbacks:
                try:
                    callback()
                except Exception:
                    logger.exception("Error in activity callback")

    def _check_loop(self) -> None:
        """Background thread: checks whether the idle threshold has been crossed."""
        while self._running:
            if self._is_user_active:
                idle_seconds = time.time() - self._last_activity_time
                if idle_seconds >= self.idle_threshold:
                    self._is_user_active = False
                    logger.info(
                        "No input for %s seconds — user is now idle", int(idle_seconds))
                    for callback in self._idle_callbacks:
                        try:
                            callback()
                        except Exception:
                            logger.exception("Error in idle callback")
            time.sleep(self.check_interval)

    def start(self) -> bool:
        """Start listening for input and checking idle state.

        Returns:
            True if started successfully, False if pynput is unavailable.
        """
        try:
            import pynput
        except ImportError:
            logger.error("pynput is not installed — activity detection unavailable")
            return False

        self._running = True

        self._mouse_listener = pynput.mouse.Listener(
            on_move=self._handle_input,
            on_click=self._handle_input,
            on_scroll=self._handle_input)
        self._keyboard_listener = pynput.keyboard.Listener(
            on_press=self._handle_input)

        self._mouse_listener.start()
        self._keyboard_listener.start()

        self._check_thread = threading.Thread(
            target=self._check_loop, daemon=True, name="cuenimby-activity-check")
        self._check_thread.start()

        logger.info(
            "Activity detection started (idle_threshold=%ss, check_interval=%ss)",
            self.idle_threshold, self.check_interval)
        return True

    def stop(self) -> None:
        """Stop listening for input."""
        self._running = False
        if self._mouse_listener:
            self._mouse_listener.stop()
        if self._keyboard_listener:
            self._keyboard_listener.stop()
        logger.info("Activity detection stopped")

    @property
    def is_user_active(self) -> bool:
        """Returns True if user has been active since the last idle transition."""
        return self._is_user_active
