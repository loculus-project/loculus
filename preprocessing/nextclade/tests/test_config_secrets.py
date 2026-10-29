from loculus_preprocessing.config import Config


def test_config_repr_does_not_leak_keycloak_password() -> None:
    config = Config(keycloak_password="s3cret-value")  # noqa: S106

    assert "s3cret-value" not in repr(config)
    assert "s3cret-value" not in str(config)
    assert config.keycloak_password == "s3cret-value"  # noqa: S105
