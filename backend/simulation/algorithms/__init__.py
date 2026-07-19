"""Built-in routing algorithms.

Importing a module here is what makes its @register decorator run — adding a
new algorithm to the app is: create the module, subclass RoutingAlgorithm,
add one import line below.
"""

from . import random_walk  # noqa: F401
