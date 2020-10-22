import {
  connect,
  JSONCodec,
  createInbox,
  NatsConnection,
  Msg,
  Empty,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/src/mod.ts";
import { delay } from "https://raw.githubusercontent.com/nats-io/nats.deno/main/nats-base-client/internal_mod.ts";

const jc = JSONCodec();

class Router {
  nc: NatsConnection;

  constructor(nc: NatsConnection) {
    this.nc = nc;
  }

  async work(payload?: Uint8Array): Promise<Msg> {
    const nodes: any[] = [];
    const available = nc.subscribe(createInbox());
    const done = (async () => {
      for await (const m of available) {
        const data = jc.decode(m.data);
        nodes.push(data);
      }
    })();

    // this code looks like it should be useful, and in multi-threaded platforms
    // it may be. However in JavaScript, this pattern is counter-intuitive. Let's
    // pull it apart.

    // client requests a status, and waits for responses for only a limited
    // amount of time. This makes sense, because messages are going to be queued
    // for the status. In the single threaded environment of JavaScript this means
    // that the client will publish soon if it is not busy doing something else
    // or when it is done doing work and processing status requests.
    this.nc.publish("cmd.status", Empty, { reply: available.getSubject() });
    await delay(250);
    await available.drain();

    if (nodes.length === 0) {
      throw new Error("no workers available");
    }

    // the response from the clients that were able to answer in the specified
    // time, are sorted by their load, note that because we are chopping responses
    // nodes that have latency, may fail to respond, even if they have zero load.
    // Possibly a heart beat model will be more accurate, as nodes with no work
    // that have some latency will be candidates. However this also means that
    // if the pending list of updates is not fully processed we don't know
    // the real status of the node
    nodes.sort((a, b): number => {
      return a.load - b.load;
    });

    // we pick the result with the source
    // this will fail if the message doesn't have a reply subject - this should
    // add some check, but not added for simplicity
    const worker = nodes[0].id;
    const load = nodes[0].load;
    console.log(`scheduling ${worker} at load ${load}`, nodes);

    // we selected the load, and call back on the selected node to process the
    // request - now here's where we start introducing a problem. We are pushing
    // data to the client, if the presure from the pushing is too fast
    // and the client is too slow, these requests will timeout
    const m = nc.request(worker, payload, { timeout: 60000 });
    m.then(() => {
      console.log(`got solution from ${worker}`);
    })
      .catch((err) => {
        console.log(`got error from ${worker}: ${err.message}`);
      });

    this.nc.flush();
    return m;
  }
}

const nc = await connect();
const router = new Router(nc);
const buf: Promise<Msg>[] = [];

for (let i = 0; i < 10; i++) {
  buf.push(router.work());
  // invoked in a loop effectively is a bad simulation add a small delay
  await delay(150);
}

await Promise.all(buf);

await nc.close();
