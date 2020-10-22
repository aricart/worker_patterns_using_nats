import {
  connect,
  JSONCodec,
  NatsConnection,
  Msg,
  Empty,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/src/mod.ts";
import {
  delay,
  nuid,
  deferred,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/nats-base-client/internal_mod.ts";

const jc = JSONCodec();

class Worker {
  seq = 0;
  load = 0;
  nc: NatsConnection;
  id = nuid.next();
  done = deferred();
  constructor(nc: NatsConnection) {
    this.nc = nc;
  }

  init() {
    // create a subscription that handles work
    const w = nc.subscribe(this.id);
    (async () => {
      for await (const m of w) {
        // response is out of band or we block the event loop
        this.work(m);
      }
    })();

    // create a subscription to handle commands
    const status = nc.subscribe("cmd.*");
    (async () => {
      for await (const m of status) {
        switch (m.subject) {
          case "cmd.stop":
            console.info(`${this.id} stopping`);
            nc.drain();
            this.done.resolve();
            break;
          case "cmd.status":
            console.info(`${this.id} status - load: ${this.load}`);
            await delay(this.load * 100);
            m.respond(
              jc.encode({ load: this.load, id: this.id }),
            );
            await nc.flush();
            break;
          default:
            console.error(`unknown cmd: ${m.subject}`);
        }
      }
    })();

    console.info(`${this.id} ready`);
  }

  async work(m: Msg) {
    // change this with work
    const seq = this.seq++;
    console.info(`${this.id} start - #${seq}`);
    this.load += 1;
    await delay(500);
    m.respond(Empty, { headers: m.headers });
    this.load -= 1;
    console.info(`${this.id} done - #${seq}`);
  }
}

const nc = await connect();
const w = new Worker(nc);
w.init();
await w.done;
