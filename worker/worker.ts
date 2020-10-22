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
