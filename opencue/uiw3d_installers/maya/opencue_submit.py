"""
OpenCue Submit Tool for Maya 2026
Works around Python 3.11 incompatibility by calling external Python 3.9
"""

import subprocess
import os
import maya.cmds as cmds
from PySide6 import QtWidgets, QtCore

PYTHON_PATH = r"C:\Program Files\Python39\python.exe"
CUEBOT_HOST = "REDACTED_IP:8443"


class SubmitDialog(QtWidgets.QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Submit to OpenCue")
        self.setMinimumWidth(400)
        self.setup_ui()
        self.load_scene_data()

    def setup_ui(self):
        layout = QtWidgets.QVBoxLayout(self)

        # Job Name
        layout.addWidget(QtWidgets.QLabel("Job Name:"))
        self.job_name = QtWidgets.QLineEdit()
        layout.addWidget(self.job_name)

        # Scene Path
        layout.addWidget(QtWidgets.QLabel("Scene:"))
        self.scene_path = QtWidgets.QLineEdit()
        self.scene_path.setReadOnly(True)
        layout.addWidget(self.scene_path)

        # Frame Range
        frame_layout = QtWidgets.QHBoxLayout()
        frame_layout.addWidget(QtWidgets.QLabel("Frames:"))
        self.start_frame = QtWidgets.QSpinBox()
        self.start_frame.setRange(0, 99999)
        frame_layout.addWidget(self.start_frame)
        frame_layout.addWidget(QtWidgets.QLabel("-"))
        self.end_frame = QtWidgets.QSpinBox()
        self.end_frame.setRange(0, 99999)
        frame_layout.addWidget(self.end_frame)
        layout.addLayout(frame_layout)

        # Chunk Size
        chunk_layout = QtWidgets.QHBoxLayout()
        chunk_layout.addWidget(QtWidgets.QLabel("Chunk Size:"))
        self.chunk_size = QtWidgets.QSpinBox()
        self.chunk_size.setRange(1, 100)
        self.chunk_size.setValue(1)
        chunk_layout.addWidget(self.chunk_size)
        chunk_layout.addStretch()
        layout.addLayout(chunk_layout)

        # Renderer
        layout.addWidget(QtWidgets.QLabel("Renderer:"))
        self.renderer = QtWidgets.QComboBox()
        self.renderer.addItems(["arnold", "mayaSoftware", "mayaHardware2", "redshift"])
        layout.addWidget(self.renderer)

        # Show
        layout.addWidget(QtWidgets.QLabel("Show:"))
        self.show_name = QtWidgets.QLineEdit("testing")
        layout.addWidget(self.show_name)

        # Buttons
        layout.addSpacing(10)
        btn_layout = QtWidgets.QHBoxLayout()
        submit_btn = QtWidgets.QPushButton("Submit")
        submit_btn.clicked.connect(self.submit)
        cancel_btn = QtWidgets.QPushButton("Cancel")
        cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(submit_btn)
        btn_layout.addWidget(cancel_btn)
        layout.addLayout(btn_layout)

    def load_scene_data(self):
        scene = cmds.file(q=True, sceneName=True)
        if not scene:
            self.scene_path.setText("(unsaved scene)")
        else:
            self.scene_path.setText(scene)
            self.job_name.setText(os.path.splitext(os.path.basename(scene))[0])

        self.start_frame.setValue(int(cmds.getAttr("defaultRenderGlobals.startFrame")))
        self.end_frame.setValue(int(cmds.getAttr("defaultRenderGlobals.endFrame")))

        renderer = cmds.getAttr("defaultRenderGlobals.currentRenderer")
        idx = self.renderer.findText(renderer)
        if idx >= 0:
            self.renderer.setCurrentIndex(idx)

    def submit(self):
        scene = self.scene_path.text()
        if not scene or scene == "(unsaved scene)":
            QtWidgets.QMessageBox.warning(self, "Error", "Please save your scene first.")
            return

        # Build submission script inline - use CommandLayer to avoid wrapper issues
        script = f'''
import sys
sys.path.insert(0, r"C:\\Program Files\\Python39\\Lib\\site-packages")

from opencue.cuebot import Cuebot
Cuebot.setHosts(["{CUEBOT_HOST}"])

import opencue

# Build job spec directly to avoid wrapper script path issues
spec = """<?xml version="1.0"?><!DOCTYPE spec PUBLIC "SPI Cue  Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.12.dtd"><spec><facility>local</facility><show>{self.show_name.text()}</show><shot>shot01</shot><user>render</user><uid>0</uid><job name="{self.job_name.text()}"><paused>False</paused><os>Windows</os><layers><layer name="render" type="Render"><cmd>"C:\\Program Files\\Autodesk\\Maya2026\\bin\\Render.exe" -r {self.renderer.currentText()} -s #IFRAME# -e #IFRAME# "{scene}"</cmd><range>{self.start_frame.value()}-{self.end_frame.value()}</range><chunk>{self.chunk_size.value()}</chunk><services><service>maya</service></services></layer></layers></job></spec>"""

jobs = opencue.api.launchSpecAndWait(spec)
print(f"Submitted: {{jobs}}")
'''

        result = subprocess.run(
            [PYTHON_PATH, "-c", script],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            QtWidgets.QMessageBox.information(
                self, "Success",
                f"Job '{self.job_name.text()}' submitted!\n\nFrames: {self.start_frame.value()}-{self.end_frame.value()}"
            )
            self.accept()
        else:
            QtWidgets.QMessageBox.critical(
                self, "Error",
                f"Submission failed:\n{result.stderr or result.stdout}"
            )


def launch():
    """Launch the submit dialog"""
    global _dialog
    parent = None
    for widget in QtWidgets.QApplication.topLevelWidgets():
        if widget.objectName() == "MayaWindow":
            parent = widget
            break
    _dialog = SubmitDialog(parent)
    _dialog.show()


# Alias for convenience
show = launch

if __name__ == "__main__":
    launch()
