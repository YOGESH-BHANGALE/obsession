"""
Configuration loader — reads config/config.yaml and provides typed access.
"""
import os
import yaml
from pathlib import Path

_CONFIG = None

def get_config() -> dict:
    """Load and cache the config.yaml file."""
    global _CONFIG
    if _CONFIG is None:
        config_path = Path(__file__).resolve().parent.parent.parent / "config" / "config.yaml"
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            _CONFIG = yaml.safe_load(f)
    return _CONFIG

def get_scoring_weights() -> dict:
    return get_config()["scoring"]

def get_zone_bands() -> dict:
    return get_config()["zones"]

def get_traversal_config() -> dict:
    return get_config()["traversal"]

def get_detector_config(detector_name: str) -> dict:
    return get_config()["detectors"].get(detector_name, {})

def get_auth_config() -> dict:
    return get_config()["auth"]

def get_server_config() -> dict:
    return get_config()["server"]

def get_database_config() -> dict:
    return get_config()["database"]

def get_forecasting_config() -> dict:
    return get_config()["forecasting"]

def get_entity_resolution_config() -> dict:
    return get_config()["entity_resolution"]

def get_nemotron_config() -> dict:
    """Retrieve NVIDIA Nemotron API configuration from environment variables."""
    # Ensure .env is loaded
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).resolve().parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
        else:
            root_env = Path(__file__).resolve().parent.parent.parent / ".env"
            if root_env.exists():
                load_dotenv(root_env)
    except Exception:
        pass

    return {
        "api_key": os.getenv("NVIDIA_API_KEY", ""),
        "base_url": os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        "model": os.getenv("NVIDIA_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
    }
