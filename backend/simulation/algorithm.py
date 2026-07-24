from abc import ABC, abstractmethod


class RoutingAlgorithm(ABC):
    """Contract every routing algorithm implements (design doc §5).

    An algorithm is a pure event handler: it never touches the event queue,
    the clock or the WebSocket — everything goes through the SimContext it
    receives. Adding a new algorithm to the simulator means subclassing this,
    decorating with @register and importing the module in algorithms/__init__.py.

    Division of labour with the engine:
      * the engine detects delivery of *data* packets, decrements TTL on
        forward and enforces safety limits — so a trivial algorithm is just a
        few lines of on_packet;
      * *control* packets (kind="control") are always handed to on_packet,
        never auto-delivered — the algorithm owns its whole control plane.
    """

    # -- metadata surfaced by GET /api/simulation/algorithms -----------------
    name: str = ""                    # API key, e.g. "random_walk"
    display_name: str = ""            # label shown in the UI dropdown
    description: str = ""             # one Polish sentence for the UI
    requires_convergence: bool = False  # True → UI may show a convergence phase

    @classmethod
    def info(cls):
        return {
            "name": cls.name,
            "display_name": cls.display_name or cls.name,
            "description": cls.description,
            "requires_convergence": cls.requires_convergence,
        }

    # -- lifecycle hooks -----------------------------------------------------
    def on_init(self, ctx):
        """Called once before any packet moves.

        Convergent algorithms schedule their control plane here (hello timers,
        initial advertisements). Trivial algorithms leave the default no-op.
        """

    @abstractmethod
    def on_packet(self, ctx, node, packet):
        """A packet arrived at ``node`` — decide what happens next.

        Data packets that were not auto-delivered land here: forward them with
        ``ctx.forward(node, packet, adjacency)`` or give up with ``ctx.drop``.
        Control packets always land here, regardless of addressing.
        """

    def on_timer(self, ctx, node, timer):
        """A timer scheduled via ``ctx.schedule_timer`` fired at ``node``."""
