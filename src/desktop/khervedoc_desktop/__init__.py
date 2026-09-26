"""KherveDOC desktop app."""

try:  # written by bin/build-desktop-release.sh for a release build
    from khervedoc_desktop._version import VERSION as __version__
except ImportError:
    __version__ = "0.1.0"
