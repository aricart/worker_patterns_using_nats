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

    this.nc.publish("cmd.status", Empty, { reply: available.getSubject() });
    await delay(250);
    await available.drain();

    if (nodes.length === 0) {
      throw new Error("no workers available");
    }

    nodes.sort((a, b): number => {
      return a.load - b.load;
    });

    // this will fail if the message doesn't have a reply subject
    const worker = nodes[0].id;
    const load = nodes[0].load;
    console.log(`scheduling ${worker} at load ${load}`, nodes);

    const m = nc.request(worker, payload, { timeout: 60000 });
    m.then(() => {
      console.log(`got solution from ${worker}`);
    })
      .catch((err) => {
        console.log(`got solution from ${worker}`);
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
