#!/usr/bin/env python
"""
CueSubmit - OpenCue Job Submission Tool
"""

import sys
import os
import getpass

from qtpy import QtCore, QtGui, QtWidgets

# OpenCue imports
from opencue.cuebot import Cuebot
import opencue


# ============================================================================
# Configuration
# ============================================================================

CUEBOT_HOST = "REDACTED_IP"
CUEBOT_PORT = 8443
LOG_ROOT = r"\\REDACTED_IP\RenderOutputRepo\OpenCue\Logs"
DEFAULT_SHOW = "testing"
DEFAULT_RENDERER = "arnold"

# Maya paths - adjust for your installation
MAYA_VERSION = "2026"
MAYA_RENDER_PATH = f"C:/Program Files/Autodesk/Maya{MAYA_VERSION}/bin/Render.exe"

# License configuration - injected into each render job via OpenCue env tags
LICENSE_SERVER = "27000@jabba.ad.uiwtx.edu"
LICENSE_ENVS = {
    "ADSKFLEX_LICENSE_FILE": LICENSE_SERVER,
    "MAYA_LICENSE_METHOD": "network",
    "MAYA_LICENSE": "unlimited",
    "solidangle_LICENSE": LICENSE_SERVER,
    "ARNOLD_GPU_ENABLED": "0",
    "LOCALAPPDATA": "C:\\Users\\csadmin400\\AppData\\Local",
    "ARNOLD_SKIP_GPU_INIT": "1",
    "OPTIX_FORCE_DEPRECATED_INIT": "1",
    "CUDA_VISIBLE_DEVICES": "",
    "ARNOLD_FORCE_HOST_DENOISE": "1",
}

# Frame tokens used by OpenCue
FRAME_START_TOKEN = "#FRAME_START#"
FRAME_END_TOKEN = "#FRAME_END#"

# Configure Cuebot connection
Cuebot.setHosts([f"{CUEBOT_HOST}:{CUEBOT_PORT}"])


# ============================================================================
# Styles
# ============================================================================

DARK_STYLE = """
QWidget {
    background-color: #1a1a1a;
    color: #e0e0e0;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 11px;
}

QLineEdit, QSpinBox, QComboBox {
    background-color: #2d2d2d;
    border: 1px solid #404040;
    border-radius: 4px;
    padding: 6px;
    color: #e0e0e0;
}

QLineEdit:focus, QSpinBox:focus, QComboBox:focus {
    border: 1px solid #c41e3a;
}

QLineEdit:disabled, QSpinBox:disabled {
    background-color: #1a1a1a;
    color: #666666;
}

QPushButton {
    background-color: #c41e3a;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    padding: 8px 20px;
    font-weight: bold;
}

QPushButton:hover {
    background-color: #d4324a;
}

QPushButton:pressed {
    background-color: #a01830;
}

QPushButton#cancelBtn {
    background-color: #404040;
    color: #e0e0e0;
}

QPushButton#cancelBtn:hover {
    background-color: #505050;
}

QPushButton#browseBtn {
    background-color: #404040;
    padding: 6px 12px;
}

QPushButton#browseBtn:hover {
    background-color: #505050;
}

QGroupBox {
    border: 1px solid #404040;
    border-radius: 6px;
    margin-top: 12px;
    padding-top: 10px;
    font-weight: bold;
}

QGroupBox::title {
    subcontrol-origin: margin;
    left: 10px;
    padding: 0 5px;
    color: #c41e3a;
}

QLabel {
    color: #b0b0b0;
}

QLabel#title {
    font-size: 24px;
    font-weight: bold;
    color: #c41e3a;
}

QCheckBox {
    spacing: 8px;
    color: #e0e0e0;
}

QCheckBox::indicator {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #404040;
    background-color: #2d2d2d;
}

QCheckBox::indicator:checked {
    background-color: #c41e3a;
    border-color: #c41e3a;
}

QCheckBox::indicator:hover {
    border-color: #c41e3a;
}

QTextEdit {
    background-color: #2d2d2d;
    border: 1px solid #404040;
    border-radius: 4px;
    padding: 6px;
    color: #90ee90;
    font-family: "Consolas", monospace;
}

QComboBox::drop-down {
    border: none;
    padding-right: 8px;
}

QComboBox::down-arrow {
    width: 12px;
    height: 12px;
}

QComboBox QAbstractItemView {
    background-color: #2d2d2d;
    border: 1px solid #404040;
    selection-background-color: #c41e3a;
    selection-color: #ffffff;
}

QSpinBox::up-button, QSpinBox::down-button {
    background-color: #404040;
    border: none;
    width: 16px;
}

QSpinBox::up-button:hover, QSpinBox::down-button:hover {
    background-color: #c41e3a;
}

QScrollBar:vertical {
    background-color: #1a1a1a;
    width: 12px;
    border-radius: 6px;
}

QScrollBar::handle:vertical {
    background-color: #404040;
    border-radius: 6px;
    min-height: 20px;
}

QScrollBar::handle:vertical:hover {
    background-color: #c41e3a;
}
"""


# ============================================================================
# Helper Functions
# ============================================================================

def get_shows():
    """Get list of shows from OpenCue."""
    try:
        return [show.name() for show in opencue.api.getShows()]
    except Exception:
        return [DEFAULT_SHOW]


def get_services():
    """Get list of services/render groups from OpenCue."""
    try:
        services = []
        for svc in opencue.api.getDefaultServices():
            services.append(svc.name())
        return sorted(services) if services else ["maya", "shell", "render"]
    except Exception:
        return ["maya", "shell", "render"]


def get_host_tags():
    """Get unique tags from all hosts."""
    try:
        tags = set()
        for host in opencue.api.getHosts():
            tags.update(host.data.tags)
        return sorted(list(tags))
    except Exception:
        return []


# ============================================================================
# Main Widget
# ============================================================================

class SimpleCueSubmit(QtWidgets.QWidget):
    """Simplified CueSubmit UI."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Submit to OpenCue")
        self.setMinimumWidth(550)
        self.setMinimumHeight(650)
        self.setup_ui()
        self.setStyleSheet(DARK_STYLE)

    def setup_ui(self):
        """Build the UI."""
        layout = QtWidgets.QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)

        # Title
        title = QtWidgets.QLabel("OpenCue")
        title.setObjectName("title")
        layout.addWidget(title)

        # Job Info Group
        job_group = QtWidgets.QGroupBox("Job Info")
        job_layout = QtWidgets.QGridLayout(job_group)
        job_layout.setSpacing(10)

        job_layout.addWidget(QtWidgets.QLabel("Job Name:"), 0, 0)
        self.job_name = QtWidgets.QLineEdit()
        self.job_name.setPlaceholderText("e.g., shot01_lighting")
        job_layout.addWidget(self.job_name, 0, 1, 1, 3)

        job_layout.addWidget(QtWidgets.QLabel("Show:"), 1, 0)
        self.show_combo = QtWidgets.QComboBox()
        self.show_combo.addItems(get_shows())
        self.show_combo.setCurrentText(DEFAULT_SHOW)
        job_layout.addWidget(self.show_combo, 1, 1)

        job_layout.addWidget(QtWidgets.QLabel("Shot:"), 1, 2)
        self.shot_name = QtWidgets.QLineEdit()
        self.shot_name.setPlaceholderText("e.g., shot01")
        job_layout.addWidget(self.shot_name, 1, 3)

        job_layout.addWidget(QtWidgets.QLabel("User Name:"), 2, 0)
        self.user_name = QtWidgets.QLineEdit(getpass.getuser())
        job_layout.addWidget(self.user_name, 2, 1, 1, 3)

        layout.addWidget(job_group)

        # Render Settings Group (was Layer Info - clearer name)
        render_group = QtWidgets.QGroupBox("Render Settings")
        render_layout = QtWidgets.QGridLayout(render_group)
        render_layout.setSpacing(10)

        # Frame Range
        render_layout.addWidget(QtWidgets.QLabel("Frame Range:"), 0, 0)
        self.frame_start = QtWidgets.QSpinBox()
        self.frame_start.setRange(0, 99999)
        self.frame_start.setValue(1)
        render_layout.addWidget(self.frame_start, 0, 1)

        render_layout.addWidget(QtWidgets.QLabel("-"), 0, 2)
        self.frame_end = QtWidgets.QSpinBox()
        self.frame_end.setRange(0, 99999)
        self.frame_end.setValue(100)
        render_layout.addWidget(self.frame_end, 0, 3)

        render_layout.addWidget(QtWidgets.QLabel("Chunk:"), 0, 4)
        self.chunk_size = QtWidgets.QSpinBox()
        self.chunk_size.setRange(1, 1000)
        self.chunk_size.setValue(1)
        self.chunk_size.setToolTip("How many frames each machine renders at a time")
        render_layout.addWidget(self.chunk_size, 0, 5)

        # Service selection
        render_layout.addWidget(QtWidgets.QLabel("Service:"), 1, 0)
        self.services_combo = QtWidgets.QComboBox()
        self.services_combo.addItems(get_services())
        self.services_combo.setToolTip("Service type determines resource requirements.\nMust match a service defined in CueGUI.")
        # Try to set maya as default if available
        idx = self.services_combo.findText("maya")
        if idx >= 0:
            self.services_combo.setCurrentIndex(idx)
        render_layout.addWidget(self.services_combo, 1, 1, 1, 2)

        # Tags selection (for targeting specific hosts)
        render_layout.addWidget(QtWidgets.QLabel("Tags:"), 1, 3)
        self.tags_combo = QtWidgets.QComboBox()
        self.tags_combo.setEditable(True)
        self.tags_combo.setToolTip("Host tags to target specific machines.\nLeave empty to use service defaults.\nSeparate multiple tags with | (e.g., maya|gpu)")
        # Populate with available tags from hosts
        available_tags = get_host_tags()
        self.tags_combo.addItem("")  # Empty option for default behavior
        self.tags_combo.addItems(available_tags)
        render_layout.addWidget(self.tags_combo, 1, 4, 1, 2)

        # Layer Name Override (hidden by default)
        layer_row = QtWidgets.QHBoxLayout()
        self.override_layer = QtWidgets.QCheckBox("Custom Layer Name:")
        self.override_layer.setChecked(False)
        self.override_layer.setToolTip("Override the auto-generated layer name")
        self.override_layer.stateChanged.connect(self.toggle_layer_name)
        layer_row.addWidget(self.override_layer)

        self.layer_name = QtWidgets.QLineEdit("render")
        self.layer_name.setEnabled(False)
        self.layer_name.setToolTip("Layer name for this render pass (e.g., beauty, shadow, ao)")
        layer_row.addWidget(self.layer_name)

        render_layout.addLayout(layer_row, 2, 0, 1, 6)

        layout.addWidget(render_group)

        # Maya Options Group
        maya_group = QtWidgets.QGroupBox("Maya Options")
        maya_layout = QtWidgets.QGridLayout(maya_group)
        maya_layout.setSpacing(10)

        maya_layout.addWidget(QtWidgets.QLabel("Maya File:"), 0, 0)
        self.maya_file = QtWidgets.QLineEdit()
        self.maya_file.setPlaceholderText("//REDACTED_IP/RenderSourceRepository/...")
        maya_layout.addWidget(self.maya_file, 0, 1)
        browse_btn = QtWidgets.QPushButton("...")
        browse_btn.setObjectName("browseBtn")
        browse_btn.setFixedWidth(40)
        browse_btn.clicked.connect(self.browse_maya_file)
        maya_layout.addWidget(browse_btn, 0, 2)

        maya_layout.addWidget(QtWidgets.QLabel("Renderer:"), 1, 0)
        self.renderer = QtWidgets.QComboBox()
        self.renderer.addItems(["arnold", "vray", "renderman", "redshift", "mayaSoftware", "mayaHardware2"])
        self.renderer.setCurrentText(DEFAULT_RENDERER)
        maya_layout.addWidget(self.renderer, 1, 1, 1, 2)

        maya_layout.addWidget(QtWidgets.QLabel("Camera:"), 2, 0)
        self.camera = QtWidgets.QLineEdit()
        self.camera.setPlaceholderText("(optional) e.g., renderCam")
        maya_layout.addWidget(self.camera, 2, 1, 1, 2)

        maya_layout.addWidget(QtWidgets.QLabel("Output Folder:"), 3, 0)
        self.output_folder = QtWidgets.QLineEdit()
        self.output_folder.setPlaceholderText("//REDACTED_IP/RenderOutputRepo/...")
        maya_layout.addWidget(self.output_folder, 3, 1)
        browse_out_btn = QtWidgets.QPushButton("...")
        browse_out_btn.setObjectName("browseBtn")
        browse_out_btn.setFixedWidth(40)
        browse_out_btn.clicked.connect(self.browse_output_folder)
        maya_layout.addWidget(browse_out_btn, 3, 2)

        # Resolution override
        res_layout = QtWidgets.QHBoxLayout()
        self.override_res = QtWidgets.QCheckBox("Override Resolution:")
        self.override_res.stateChanged.connect(self.toggle_resolution)
        res_layout.addWidget(self.override_res)

        self.res_width = QtWidgets.QSpinBox()
        self.res_width.setRange(1, 8192)
        self.res_width.setValue(1920)
        self.res_width.setEnabled(False)
        res_layout.addWidget(self.res_width)

        res_layout.addWidget(QtWidgets.QLabel("x"))

        self.res_height = QtWidgets.QSpinBox()
        self.res_height.setRange(1, 8192)
        self.res_height.setValue(1080)
        self.res_height.setEnabled(False)
        res_layout.addWidget(self.res_height)

        res_layout.addStretch()
        maya_layout.addLayout(res_layout, 4, 0, 1, 3)

        layout.addWidget(maya_group)

        # Submission Details Group
        details_group = QtWidgets.QGroupBox("Submission Details")
        details_layout = QtWidgets.QVBoxLayout(details_group)

        self.command_preview = QtWidgets.QTextEdit()
        self.command_preview.setReadOnly(True)
        self.command_preview.setMaximumHeight(80)
        details_layout.addWidget(self.command_preview)

        layout.addWidget(details_group)

        # Update command preview when fields change
        self.job_name.textChanged.connect(self.update_command_preview)
        self.maya_file.textChanged.connect(self.update_command_preview)
        self.renderer.currentTextChanged.connect(self.update_command_preview)
        self.camera.textChanged.connect(self.update_command_preview)
        self.output_folder.textChanged.connect(self.update_command_preview)
        self.frame_start.valueChanged.connect(self.update_command_preview)
        self.frame_end.valueChanged.connect(self.update_command_preview)
        self.override_res.stateChanged.connect(self.update_command_preview)
        self.res_width.valueChanged.connect(self.update_command_preview)
        self.res_height.valueChanged.connect(self.update_command_preview)

        # Buttons
        btn_layout = QtWidgets.QHBoxLayout()
        btn_layout.addStretch()

        cancel_btn = QtWidgets.QPushButton("Cancel")
        cancel_btn.setObjectName("cancelBtn")
        cancel_btn.clicked.connect(self.close)
        btn_layout.addWidget(cancel_btn)

        submit_btn = QtWidgets.QPushButton("Submit")
        submit_btn.clicked.connect(self.submit_job)
        btn_layout.addWidget(submit_btn)

        layout.addLayout(btn_layout)

        # Initial command preview
        self.update_command_preview()

    def toggle_resolution(self, state):
        """Enable/disable resolution inputs."""
        enabled = state == QtCore.Qt.Checked
        self.res_width.setEnabled(enabled)
        self.res_height.setEnabled(enabled)

    def toggle_layer_name(self, state):
        """Enable/disable custom layer name input."""
        enabled = state == QtCore.Qt.Checked
        self.layer_name.setEnabled(enabled)
        if not enabled:
            self.layer_name.setText("render")  # Reset to default

    def browse_maya_file(self):
        """Open file browser for Maya file."""
        file_path, _ = QtWidgets.QFileDialog.getOpenFileName(
            self, "Select Maya File",
            "//REDACTED_IP/RenderSourceRepository",
            "Maya Files (*.ma *.mb);;All Files (*)"
        )
        if file_path:
            # Convert to UNC-style path
            file_path = file_path.replace("/", "\\")
            if file_path.startswith("\\\\"):
                file_path = "//" + file_path[2:]
            self.maya_file.setText(file_path)

    def browse_output_folder(self):
        """Open folder browser for output."""
        folder = QtWidgets.QFileDialog.getExistingDirectory(
            self, "Select Output Folder",
            "//REDACTED_IP/RenderOutputRepo"
        )
        if folder:
            folder = folder.replace("\\", "/")
            self.output_folder.setText(folder)

    def update_command_preview(self):
        """Update the command preview."""
        maya_file = self.maya_file.text().replace("\\", "/") if self.maya_file.text() else "<maya_file>"
        renderer = self.renderer.currentText()
        camera = self.camera.text()
        output = self.output_folder.text().replace("\\", "/") if self.output_folder.text() else ""

        cmd = '"{}" -r {} -s {} -e {}'.format(
            MAYA_RENDER_PATH,
            renderer,
            FRAME_START_TOKEN,
            FRAME_END_TOKEN
        )

        if self.override_res.isChecked():
            cmd += ' -x {} -y {}'.format(self.res_width.value(), self.res_height.value())

        if output:
            cmd += ' -rd "{}"'.format(output)

        if camera:
            cmd += ' -cam {}'.format(camera)

        cmd += ' "{}"'.format(maya_file)

        self.command_preview.setText(cmd)

    def validate(self):
        """Validate form inputs."""
        errors = []

        if not self.job_name.text().strip():
            errors.append("Job Name is required")
        if not self.shot_name.text().strip():
            errors.append("Shot is required")
        if not self.maya_file.text().strip():
            errors.append("Maya File is required")
        if self.frame_start.value() > self.frame_end.value():
            errors.append("Frame Start must be less than Frame End")

        if errors:
            QtWidgets.QMessageBox.warning(
                self, "Validation Error",
                "Please fix the following:\n\n" + "\n".join(f"• {e}" for e in errors)
            )
            return False
        return True

    def submit_job(self):
        """Submit the job to OpenCue using XML spec."""
        if not self.validate():
            return

        try:
            # Gather job data
            show = self.show_combo.currentText()
            shot = self.shot_name.text()
            job_name = f"{show}-{shot}-{self.job_name.text()}"
            username = self.user_name.text()
            
            # Use custom layer name if override is checked, otherwise use renderer name
            renderer = self.renderer.currentText()
            if self.override_layer.isChecked() and self.layer_name.text().strip():
                layer_name = self.layer_name.text().strip()
            else:
                layer_name = renderer
            
            frame_range = f"{self.frame_start.value()}-{self.frame_end.value()}"
            chunk = self.chunk_size.value()
            service = self.services_combo.currentText()
            tags = self.tags_combo.currentText().strip()

            # Build render command (simple, no cmd /c wrapper needed)
            # Strip paths to avoid trailing whitespace/newline issues
            maya_file = self.maya_file.text().strip().replace("\\", "/")
            output = self.output_folder.text().strip().replace("\\", "/") if self.output_folder.text() else ""
            camera = self.camera.text().strip()

            render_cmd = '"{}" -r {} -s {} -e {}'.format(
                MAYA_RENDER_PATH,
                renderer,
                FRAME_START_TOKEN,
                FRAME_END_TOKEN
            )

            if self.override_res.isChecked():
                render_cmd += ' -x {} -y {}'.format(self.res_width.value(), self.res_height.value())

            if output:
                render_cmd += ' -rd "{}"'.format(output)

            if camera:
                render_cmd += ' -cam {}'.format(camera)

            render_cmd += ' "{}"'.format(maya_file)

            # Build environment variable XML tags
            # Format: <env><key name="VAR">value</key></env>
            env_keys = "\n          ".join(
                f'<key name="{key}">{value}</key>'
                for key, value in LICENSE_ENVS.items()
            )

            # Build optional tags element
            tags_element = f"<tags>{tags}</tags>" if tags else ""

            # Build XML spec with <env> tags for license config
            spec = '''<?xml version="1.0"?>
<!DOCTYPE spec PUBLIC "SPI Cue Specification Language" "http://localhost:8080/spcue/dtd/cjsl-1.12.dtd">
<spec>
  <facility>local</facility>
  <show>{show}</show>
  <shot>{shot}</shot>
  <user>{user}</user>
  <uid>1000</uid>
  <job name="{job_name}">
    <paused>False</paused>
    <os>Windows</os>
    <layers>
      <layer name="{layer_name}" type="Render">
        <cmd>{cmd}</cmd>
        <range>{range}</range>
        <chunk>{chunk}</chunk>
        {tags_element}
        <env>
          {env_keys}
        </env>
        <services>
          <service>{service}</service>
        </services>
      </layer>
    </layers>
  </job>
</spec>'''.format(
                show=show,
                shot=shot,
                user=username,
                job_name=job_name,
                layer_name=layer_name,
                cmd=render_cmd,
                range=frame_range,
                chunk=chunk,
                tags_element=tags_element,
                env_keys=env_keys,
                service=service
            )

            # Submit using same method as working version
            jobs = opencue.api.launchSpecAndWait(spec)

            # Build log path
            log_path = os.path.join(LOG_ROOT, show, shot, "logs", job_name)

            # Success message
            msg = f"Job submitted successfully!\n\n"
            if jobs:
                for job in jobs:
                    msg += f"Job Name: {job.name()}\n"
                    msg += f"Job ID: {job.id()}\n"
            msg += f"Frames: {frame_range}\n"
            msg += f"Render On: {service}\n\n"
            msg += f"Log Path:\n{log_path}"

            QtWidgets.QMessageBox.information(self, "Job Submitted", msg)

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            QtWidgets.QMessageBox.critical(
                self, "Submission Failed",
                f"Failed to submit job:\n\n{str(e)}\n\n{error_details}"
            )


# ============================================================================
# Main
# ============================================================================

def main():
    """Run the application."""
    app = QtWidgets.QApplication(sys.argv)
    app.setStyle("Fusion")

    window = SimpleCueSubmit()
    window.show()

    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
