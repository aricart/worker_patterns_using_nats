/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
        // this means that this loop won't process more requests
        // until it blocks, yet, in the mean while the cmd loop
        // below has been lying and responding with a status
        // that specifies a false load potentially queuing
        // more work for this node.
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
            // this load is not right, because we are providing a status where
            // we are on the processing not on what is queued up...
            // we can tweak this further by doing:
            // w.getPending() + this.load as the current load
            // but this accuracy again depends on whether the worker loop
            // suspends, if it is busy it may have not had time to
            // process the inbound, or send the outbound...
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
