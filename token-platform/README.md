# Token platform

Static HTML, CSS, and JavaScript for the public XahauIndex API. No build step and no Node.js.

Open `index.html` in a browser. The page calls `https://xahauindex.dev` directly. No API key.

The list requests a single page. Pair tabs come from that token’s trade tape. The chart requests candles only for the pair and period on screen. Responses are cached in memory until the tab is closed.

If the browser blocks API calls from a file on disk, serve this folder with any static file server and open the local address.
