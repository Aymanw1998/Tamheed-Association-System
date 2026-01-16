// server/utils/sse.js
const clients = new Set();

function eventsHandler(req, res) {
    console.log("clients", clients);
    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    const client = { res };
    clients.add(client);
    req.on('close', () => clients.delete(client));
}

function broadcast(evt) {
    const payload = `data: ${JSON.stringify(evt)}\n\n`;
    for (const c of clients) c.res.write(payload);
}

module.exports = { eventsHandler, broadcast };
