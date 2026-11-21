
"""Unit tests for cellar geometry and bottle placement."""

from app.geometry import (
    D,
    R,
    STACK_STEP,
    present_racks,
    support_rack,
    snap,
    layer,
    rack_stats,
    find_free_spot,
    location_text,
)


def sample_racks():
    return [
        {
            "id": 1,
            "name": "Lower Rack",
            "present": True,
            "y_cm": 10.0,
            "depth_cm": 50.0,
            "capacity": 10,
        },
        {
            "id": 2,
            "name": "Upper Rack",
            "present": True,
            "y_cm": 40.0,
            "depth_cm": 50.0,
            "capacity": 10,
        },
        {
            "id": 3,
            "name": "Removed Rack",
            "present": False,
            "y_cm": 25.0,
            "depth_cm": 50.0,
            "capacity": 10,
        },
    ]


def test_present_racks_filters_and_sorts_by_height():
    racks = sample_racks()

    result = present_racks(racks)

    assert [rack["id"] for rack in result] == [1, 2]


def test_support_rack_returns_highest_supported_rack():
    racks = sample_racks()

    result = support_rack(racks, 15.0)

    assert result["id"] == 1


def test_support_rack_returns_none_without_support():
    racks = sample_racks()

    result = support_rack(racks, 3.0)

    assert result is None


def test_snap_clamps_coordinates_to_cellar_bounds():
    result = snap(
        racks=[],
        x=-10,
        y=0,
        z=-5,
        width=100,
        height=100,
        depth=60,
    )

    assert result["x"] == R
    assert result["z"] == 2.0
    assert result["rack_id"] is None
    assert result["level"] == 0


def test_snap_uses_support_rack_and_calculates_stack_level():
    racks = sample_racks()

    result = snap(
        racks=racks,
        x=20,
        y=25,
        z=10,
        width=100,
        height=100,
        depth=60,
    )

    assert result["rack_id"] == 1
    assert result["level"] == round((25 - 10 - R) / STACK_STEP)


def test_snap_does_not_allow_unsupported_stack():
    racks = sample_racks()

    result = snap(
        racks=racks,
        x=20,
        y=25,
        z=10,
        width=100,
        height=100,
        depth=60,
        bottles=[],
    )

    assert result["level"] == 0


def test_layer_classifies_front_and_back():
    assert layer(10, 50) == "front"
    assert layer(25, 50) == "back"


def test_rack_stats_counts_bottles_and_overcapacity():
    rack = {"id": 1, "capacity": 2}
    bottles = [
        {"rack_id": 1, "level": 0},
        {"rack_id": 1, "level": 0},
        {"rack_id": 1, "level": 1},
        {"rack_id": 2, "level": 0},
    ]

    result = rack_stats(rack, bottles)

    assert result == {
        "count": 3,
        "base_count": 2,
        "over_capacity": True,
    }


def test_find_free_spot_prefers_matching_rack():
    racks = sample_racks()

    result = find_free_spot(
        racks=racks,
        bottles=[],
        width=100,
        prefer=lambda rack: rack["id"] == 2,
        eye_level=25,
    )

    assert result is not None
    assert result["rack_id"] == 2
    assert result["rack_name"] == "Upper Rack"
    assert result["level"] == 0


def test_find_free_spot_returns_none_when_no_racks_are_present():
    result = find_free_spot(
        racks=[],
        bottles=[],
        width=100,
        prefer=lambda rack: True,
    )

    assert result is None


def test_location_text_includes_rack_side_and_stack_level():
    bottle = {
        "x": 30,
        "z": 10,
        "level": 1,
    }

    result = location_text(bottle, "Upper Rack")

    assert result.startswith("Upper Rack")
    assert "30 cm from left" in result
    assert "front" in result
    assert "stacked L1" in result


def test_location_text_handles_free_standing_bottle():
    bottle = {
        "x": 50,
        "z": 30,
        "level": 0,
    }

    result = location_text(bottle, None)

    assert result.startswith("free-standing")
    assert "back" in result
    assert "stacked" not in result
