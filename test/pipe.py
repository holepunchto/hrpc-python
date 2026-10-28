import asyncio


class End:
    def __init__(self, written=None):
        self._queue = asyncio.Queue()
        self.peer = None
        self.closed = False
        self.written = [] if written is None else written

    async def read(self):
        data = await self._queue.get()

        if not data:
            self._queue.put_nowait(b"")

        return data

    async def write(self, data):
        if self.closed:
            raise BrokenPipeError("End is closed")

        self.written.append(bytes(data))
        self.peer._queue.put_nowait(bytes(data))

    async def close(self):
        for end in (self, self.peer):
            if not end.closed:
                end.closed = True
                end._queue.put_nowait(b"")


def pair(written=None):
    a, b = End(written), End(written)
    a.peer, b.peer = b, a
    return a, b
