"""Background work as PostgreSQL rows (blueprint section 2): no Redis or Celery.

Every five seconds the worker releases lapsed holds and missed arrivals and purges idempotency
replay metadata past its retention. Each batch claims rows with SKIP LOCKED in its own short
transaction, so it never queues behind a gate or booking transaction.
"""

import logging
import signal
import threading

from django.core.management.base import BaseCommand
from django.db import close_old_connections

from config import clock
from modules.accounts.idempotency import purge_expired
from modules.parking.reservations import sweep_elapsed

logger = logging.getLogger("bayline.worker")
INTERVAL_SECONDS = 5


class Command(BaseCommand):
    help = "Run Bayline's background sweeps every five seconds, or once with --once."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Run one pass and exit.")

    def handle(self, *args, **options):
        if options["once"]:
            self._sweep()
            return
        stop = threading.Event()
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, lambda *_: stop.set())
        self.stdout.write("Worker started.")
        while not stop.is_set():
            # A database restart leaves a dead connection behind; drop it before the next pass.
            close_old_connections()
            try:
                self._sweep()
            except Exception:
                logger.exception("Worker pass failed; retrying at the next interval.")
            stop.wait(INTERVAL_SECONDS)
        self.stdout.write("Worker stopped.")

    def _sweep(self) -> None:
        now = clock.now()
        expired, no_shows = sweep_elapsed(now)
        purged = purge_expired(now)
        if expired or no_shows or purged:
            self.stdout.write(
                f"Expired {expired} hold(s), marked {no_shows} no-show(s), "
                f"purged {purged} replay record(s)."
            )
