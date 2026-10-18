"""Algorithm registry: the only place the rest of the app looks algorithms up.

Usage in an algorithm module:

    from ..algorithm import RoutingAlgorithm
    from ..registry import register

    @register
    class MyAlgo(RoutingAlgorithm):
        name = "my_algo"
        ...
"""

ALGORITHMS = {}


def register(cls):
    if not cls.name:
        raise ValueError(f"{cls.__name__} must define a non-empty 'name'")
    if cls.name in ALGORITHMS:
        raise ValueError(f"Algorithm '{cls.name}' is already registered")
    ALGORITHMS[cls.name] = cls
    return cls


def get_algorithm(name, options=None):
    """Instantiate a registered algorithm; raises KeyError for unknown names."""
    return ALGORITHMS[name](options)


def list_algorithms():
    return [cls.info() for cls in ALGORITHMS.values()]
