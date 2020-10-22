import {
  connect,
  JSONCodec,
  NatsConnection,
  headers,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/src/mod.ts";
import {
  nuid,
  Timeout,
  timeout,
  deferred,
} from "https://raw.githubusercontent.com/nats-io/nats.deno/main/nats-base-client/internal_mod.ts";

const jc = JSONCodec();

interface Job {
  timeout?: Timeout<void>;
  id: string;
  data: Uint8Array;
}

class Queue {
  nc: NatsConnection;
  work: Job[] = [];
  pending = new Map<string, Job>();
  done = deferred<void>();

  constructor(nc: NatsConnection) {
    this.nc = nc;
  }

  async run(): Promise<void> {
    const acks = this.nc.subscribe("done");
    const done = (async () => {
      for await (const a of acks) {
        const id = a.headers ? a.headers.get("id") : "";
        this.handleAck(id);
      }
    })();

    const poll = this.nc.subscribe("poll");
    const _ = (async () => {
      for await (const m of poll) {
        const job = this.work.length ? this.work[0] : undefined;
        if (job) {
          const h = headers();
          h.set("id", job.id);
          this.setPending(job);
          this.work = this.work.slice(1);
          console.info(`scheduling job ${job.id}`);
          m.respond(job.data, { reply: "done", headers: h });
        }
      }
    })();

    await done;
  }

  add(data: Uint8Array): void {
    this.work.push({ data: data, id: nuid.next() });
  }

  private setPending(job: Job) {
    job.timeout = timeout<void>(30 * 1000);
    job.timeout.catch(() => {
      this.handleTimeout(job);
    });
    this.pending.set(job.id, job);
  }

  private handleTimeout(job: Job) {
    job.timeout = undefined;
    this.pending.delete(job.id);
    this.work.push(job);
  }

  private handleAck(id: string) {
    console.log(`handle ack ${id}`);
    const job = this.pending.get(id);
    if (job && job.timeout) {
      job.timeout.cancel();
      this.pending.delete(job.id);
      console.info(`job ${job.id} ack'd`);

      if (this.pending.size === 0 && this.work.length === 0) {
        nc.drain();
      }
    } else {
      console.log("didn't find job", id);
    }
  }
}

const nc = await connect({ headers: true });
const feeder = new Queue(nc);

feeder.add(jc.encode("a"));
feeder.add(jc.encode("b"));
feeder.add(jc.encode("c"));
feeder.add(jc.encode("d"));
feeder.add(jc.encode("e"));
feeder.add(jc.encode("f"));
feeder.add(jc.encode("g"));

feeder.run();
await nc.closed();
