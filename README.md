# Worker Patterns

- [Install Deno](https://deno.land/)
- `deno run --allow-all --unstable worker/worker.ts` x 16
- `deno run --allow-all --unstable worker/feeder.ts`




## Jittered

The jittered pattern is possibly a good pattern only in platforms that use multiple threads.
In async JavaScript we can get an idea, but it is not accurate, and it results in the worker
providing partial information. The code required also is busy routing, which is something that
NATS can do very well without any supervisor process. See the code for more commentary.


## Worker

The worker pattern is much easier to implement and vastly more lively. It doesn't rely on
latency from the worker nodes, but rather on whether worker nodes want to process work.
It also handles the possibility that the worker didn't complete the job - this could be added
to the Jittered example, but it will further complexify it further.

The worker pattern relies on request/reply. Each feeder is part of a queue group and only
lives when it has data to provide. This means that feeders can come and go, while workers
simply poll at some interval (can be fast of slow as response latency allows).

When the worker wants data, it publishes a request that is delivered to one of the feeders.
If the timing of the feeder is not great, the feeder won't return data, and the worker
will have to poll again. If there's data, the feeder provides the data, along with a reply
subject. The reply subject allows the worker to respond when it has completed.

The feeder tracks the worker. Requests that have been distributed, are waited for a certain
amount of time. If worker doesn't acknowledge the processing, the feeder considers the
response lost or the worker gone, and simply re-queues the failed task so that it
becomes available for another worker request (yes idempotent patterns are important).

Additional optimizations are possible. If the response for completion on a re-scheduled task
arrives, it is possible for the feeder, to drop redelivered response when it arrives or to
cancel a non-assigned work task before it is handed out again.


## JetStream

The new version of the NATS server implement the Worker pattern in full. When combined with a stream
that has a retention policy of "WorkQueuePolicy", it is effectively a `Worker` on steroids.
Addressing the need for applications to process large amounts of data reliably at the speed of a
worker.

https://github.com/nats-io/jetstream#consuming-pull-based-consumers
