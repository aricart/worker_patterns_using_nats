import {
  connect,
  NatsConnection,
  ErrorCode,
  Msg,
  Empty,
  JSONCodec,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/src/mod.ts";
import {
  delay,
  nuid,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/nats-base-client/internal_mod.ts";

const jc = JSONCodec();

class Worker {
  seq = 0;
  load = 0;
  nc: NatsConnection;
  id = nuid.next();
  constructor(nc: NatsConnection) {
    this.nc = nc;
  }

  async work(m: Msg) {
    const seq = this.seq++;
    console.info(`${this.id} start work - #${seq}`);
    await delay(500);
    console.log(`${this.id} processed ${jc.decode(m.data)}`);
  }

  async maybeWork() {
    try {
      const m = await this.nc.request("poll");
      await this.work(m);
      console.info(`acking ${m.headers!.get("id")} to ${m.reply}`);
      m.respond(Empty, { headers: m.headers });
    } catch (err) {
      if (err.code === ErrorCode.REQUEST_ERROR) {
        console.info("no responders - sleeping");
        await delay(500);
      }
    }
  }
}

const nc = await connect({ headers: true, noResponders: true });
const w = new Worker(nc);
while (true) {
  await w.maybeWork();
}
