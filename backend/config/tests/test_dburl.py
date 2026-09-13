import pytest

from config.dburl import parse_database_url


def test_parses_encoded_credentials_and_port():
    db = parse_database_url("postgres://bay%40line:p%2Fss@127.0.0.1:54330/bayline_test")

    assert db["USER"] == "bay@line"
    assert db["PASSWORD"] == "p/ss"
    assert db["HOST"] == "127.0.0.1"
    assert db["PORT"] == "54330"
    assert db["NAME"] == "bayline_test"


def test_defaults_port_to_5432():
    assert parse_database_url("postgresql://u:p@db/bayline")["PORT"] == "5432"


@pytest.mark.parametrize(
    "url", ["mysql://u:p@db/bayline", "postgres://u:p@db/", "postgres:///bayline", ""]
)
def test_rejects_unusable_urls(url):
    with pytest.raises(ValueError):
        parse_database_url(url)
