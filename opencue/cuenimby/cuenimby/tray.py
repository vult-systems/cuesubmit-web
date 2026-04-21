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

"""System tray application for CueNIMBY."""

import logging
from typing import Optional

import pystray
from PIL import Image, ImageDraw
from pystray import MenuItem as Item

from .activity import ActivityDetector
from .config import Config
from .monitor import HostMonitor, HostState
from .notifier import Notifier
from .scheduler import NimbyScheduler

logger = logging.getLogger(__name__)


class CueNIMBYTray:
    """System tray application for NIMBY control."""

    # Icon colors for different states
    ICON_COLORS = {
        HostState.AVAILABLE: "#1DB954",    # Green
        HostState.WORKING: "#0078D4",      # Blue
        HostState.DISABLED: "#C42B1C",     # Red
        HostState.NIMBY_LOCKED: "#D47800", # Amber
        HostState.UNKNOWN: "#767676",      # Gray
    }

    # Human-readable state labels
    STATE_LABELS = {
        HostState.AVAILABLE: "Available for Renders",
        HostState.WORKING: "Rendering",
        HostState.DISABLED: "Paused \u2014 Not Rendering",
        HostState.NIMBY_LOCKED: "Paused \u2014 User Active",
        HostState.UNKNOWN: "Connecting...",
    }

    def __init__(self, config: Optional[Config] = None):
        """Initialize tray application.

        Args:
            config: Configuration object. If None, uses default.
        """
        self.config = config or Config()
        self.monitor: Optional[HostMonitor] = None
        self.notifier: Optional[Notifier] = None
        self.scheduler: Optional[NimbyScheduler] = None
        self.activity_detector: Optional[ActivityDetector] = None
        self.icon: Optional[pystray.Icon] = None
        # True while the host is locked due to detected user activity (not manual)
        self._activity_locked: bool = False

        self._init_components()

    def _init_components(self) -> None:
        """Initialize application components."""
        # Initialize notifier
        if self.config.show_notifications:
            self.notifier = Notifier()

        # Initialize monitor
        self.monitor = HostMonitor(
            cuebot_host=self.config.cuebot_host,
            cuebot_port=self.config.cuebot_port,
            hostname=self.config.hostname,
            use_ip_as_hostname=self.config.use_ip_as_hostname,
            poll_interval=self.config.poll_interval
        )

        # Register callbacks
        self.monitor.on_state_change(self._on_state_change)
        self.monitor.on_frame_started(self._on_frame_started)

        # Initialize scheduler if enabled
        if self.config.scheduler_enabled and self.config.schedule:
            self.scheduler = NimbyScheduler(self.config.schedule)

        # Initialize activity detection if enabled
        if self.config.activity_detection_enabled:
            self.activity_detector = ActivityDetector(
                idle_threshold=self.config.idle_threshold,
                check_interval=self.config.activity_check_interval
            )
            self.activity_detector.on_activity(self._on_user_activity)
            self.activity_detector.on_idle(self._on_user_idle)

    def _create_icon_image(self, state: HostState) -> Image.Image:
        """Create icon image for given state.

        Args:
            state: Host state.

        Returns:
            PIL Image object.
        """
        size = 64
        image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)

        # Background circle
        hex_color = self.ICON_COLORS.get(state, self.ICON_COLORS[HostState.UNKNOWN])
        r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
        draw.ellipse([3, 3, 61, 61], fill=(r, g, b, 255))

        w = (255, 255, 255, 220)  # white overlay

        if state == HostState.AVAILABLE:
            # Play triangle
            draw.polygon([(23, 18), (48, 32), (23, 46)], fill=w)
        elif state == HostState.WORKING:
            # Four-dot spinner (render indicator)
            for x, y, alpha in [(32, 14), (50, 32), (32, 50), (14, 32)]:
                a = 230 if x == 32 and y == 14 else 140
                draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255, a))
        elif state == HostState.DISABLED:
            # Pause bars
            draw.rectangle([17, 17, 27, 47], fill=w)
            draw.rectangle([37, 17, 47, 47], fill=w)
        elif state == HostState.NIMBY_LOCKED:
            # Lightning bolt
            draw.polygon([(37, 12), (20, 34), (30, 34), (26, 52), (44, 30), (34, 30)], fill=w)
        else:  # UNKNOWN — exclamation mark
            draw.rectangle([28, 13, 36, 37], fill=w)
            draw.ellipse([28, 42, 36, 50], fill=w)

        return image

    def _update_icon(self) -> None:
        """Update tray icon to reflect current state."""
        if self.icon:
            state = self.monitor.get_current_state()
            self.icon.icon = self._create_icon_image(state)
            label = self.STATE_LABELS.get(state, state.value.title())
            self.icon.title = f"CueNIMBY \u2014 {label}"
            self.icon.update_menu()

    def _notify(self, title: str, message: str) -> None:
        """Show a notification via pystray balloon tip (most reliable on Windows)."""
        try:
            if self.icon:
                self.icon.notify(message, title)
                return
        except Exception:
            pass
        # Fallback for platforms where pystray notify is unavailable
        if self.notifier:
            self.notifier.notify(title, message)
        else:
            logger.info("Notification: %s \u2014 %s", title, message)

    def _on_state_change(self, old_state: HostState, new_state: HostState) -> None:
        """Handle state change.

        Args:
            old_state: Previous state.
            new_state: New state.
        """
        logger.info(f"State changed: {old_state.value} -> {new_state.value}")
        self._update_icon()

        if new_state == HostState.NIMBY_LOCKED:
            self._notify("Rendering Paused", "This PC is busy \u2014 renders are on hold.")
        elif old_state == HostState.NIMBY_LOCKED and new_state == HostState.AVAILABLE:
            self._notify("Rendering Resumed", "PC is idle and available for the render farm.")
        elif new_state == HostState.DISABLED and old_state != HostState.NIMBY_LOCKED:
            self._notify("Renders Paused", "This PC has been excluded from rendering.")
        elif new_state == HostState.AVAILABLE and old_state == HostState.DISABLED:
            self._notify("Renders Allowed", "This PC is now accepting render jobs.")

    def _on_frame_started(self, job_name: str, frame_name: str) -> None:
        """Handle frame start.

        Args:
            job_name: Job name.
            frame_name: Frame name.
        """
        logger.info(f"Frame started: {job_name}/{frame_name}")
        self._notify("Render Job Started", f"This PC is now rendering: {job_name}")

    def _on_scheduler_state_change(self, desired_state: str) -> None:
        """Handle scheduler state change.

        Args:
            desired_state: Desired state ("available" or "disabled").
        """
        try:
            if desired_state == "disabled":
                self.monitor.lock_host()
            elif desired_state == "available":
                self.monitor.unlock_host()
        except RuntimeError as e:
            logger.error(f"Scheduler failed to change host state: {e}")
            self._notify("Scheduler Error", str(e))

    def _toggle_available(self, icon, item) -> None:
        """Toggle host availability."""
        current_state = self.monitor.get_current_state()

        try:
            if current_state in (HostState.DISABLED, HostState.NIMBY_LOCKED):
                # Enable host — clear auto-lock flag since user is overriding manually
                if self.monitor.unlock_host():
                    self._activity_locked = False
                    logger.info("Host enabled by user")
            else:
                # Disable host — mark as manual lock (not activity-based)
                if self.monitor.lock_host():
                    self._activity_locked = False
                    logger.info("Host disabled by user")
        except RuntimeError as e:
            logger.error(f"Failed to toggle host state: {e}")
            self._notify("CueNIMBY Error", str(e))

    def _is_available(self, item) -> bool:
        """Check if host is available (for menu checkbox)."""
        state = self.monitor.get_current_state()
        return state in (HostState.AVAILABLE, HostState.WORKING)

    def _quit(self, icon, item) -> None:
        """Quit application."""
        logger.info("Shutting down CueNIMBY")
        self.stop()
        icon.stop()

    def _create_menu(self) -> pystray.Menu:
        """Create tray menu.

        Returns:
            pystray.Menu object.
        """
        return pystray.Menu(
            Item(
                lambda item: "Status: " + self.STATE_LABELS.get(
                    self.monitor.get_current_state(), "Unknown"),
                None,
                enabled=False
            ),
            pystray.Menu.SEPARATOR,
            Item(
                lambda item: "Pause Renders" if self._is_available(item) else "Allow Renders",
                self._toggle_available
            ),
            pystray.Menu.SEPARATOR,
            Item("Quit", self._quit)
        )

    def start(self) -> None:
        """Start the tray application."""
        # Start monitor
        self.monitor.start()

        # Start activity detector if configured
        if self.activity_detector:
            self.activity_detector.start()

        # Start scheduler if enabled
        if self.scheduler:
            self.scheduler.start(self._on_scheduler_state_change)

        # Create and run tray icon
        state = self.monitor.get_current_state()
        label = self.STATE_LABELS.get(state, state.value.title())
        self.icon = pystray.Icon(
            "cuenimby",
            self._create_icon_image(state),
            f"CueNIMBY \u2014 {label}",
            self._create_menu()
        )

        logger.info("CueNIMBY tray started")
        self.icon.run()

    def stop(self) -> None:
        """Stop the tray application."""
        if self.activity_detector:
            self.activity_detector.stop()
        if self.monitor:
            self.monitor.stop()
        if self.scheduler:
            self.scheduler.stop()
        logger.info("CueNIMBY tray stopped")

    def _on_user_activity(self) -> None:
        """Called when user activity is detected after an idle period.

        Locks the host immediately so renders stop being dispatched to this
        machine while the student is working.
        """
        state = self.monitor.get_current_state()
        if state in (HostState.AVAILABLE, HostState.WORKING):
            logger.info("User activity detected — locking host for student use")
            try:
                self.monitor.lock_host()
                self._activity_locked = True
                mins = max(1, self.config.idle_threshold // 60)
                self._notify(
                    "Rendering Paused",
                    f"Workstation in use \u2014 renders resume after {mins} min of inactivity."
                )
            except RuntimeError as e:
                logger.error("Failed to lock host on user activity: %s", e)
        else:
            logger.debug(
                "User activity detected but host is already in state: %s", state.value)

    def _on_user_idle(self) -> None:
        """Called when no user input has been detected for idle_threshold seconds.

        Unlocks the host so the render farm can resume using this machine.
        Only unlocks if CueNIMBY was the one that locked it (not a manual lock).
        """
        if not self._activity_locked:
            logger.debug("Idle threshold reached but host was not auto-locked — skipping unlock")
            return
        state = self.monitor.get_current_state()
        if state == HostState.DISABLED:
            logger.info(
                "User idle for %s seconds — unlocking host for rendering",
                self.config.idle_threshold)
            try:
                self.monitor.unlock_host()
                self._activity_locked = False
                self._notify("Rendering Resumed", "Workstation idle \u2014 now available for rendering.")
            except RuntimeError as e:
                logger.error("Failed to unlock host after idle: %s", e)
        else:
            self._activity_locked = False
            logger.debug(
                "Idle threshold reached but host is in state: %s — no unlock needed",
                state.value)
