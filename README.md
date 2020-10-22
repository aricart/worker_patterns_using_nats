# Worker Patterns

- [Install Deno](https://deno.land/)
- `deno run --allow-all --unstable worker/worker.ts` x 16
- `deno run --allow-all --unstable worker/feeder.ts`




## Jittered

The jittered response pattern doesn't work well unless the environment is multi-threaded.
The implementation effectively delays responding based on some delta depending on how busy it is.

The 'simple' implementation is rather complex, specially if there's the idea of a router/scheduler.

## Service

The worker implementation is much simpler, lively and reliable. 
It relies on a worker sending a request, which may or not be answered with a work request.
If data is returned, the worker processes it, finally sending an ack back to confirm
that the operation suceeded.

The feeder process simply needs to track if an ack was received, otherwise it can re-post the
job for a different worker to answer.

