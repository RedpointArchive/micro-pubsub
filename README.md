# micro-pubsub

An in-memory Pub/Sub server that supports explicit acknowledgements and shared client IDs.

This server was written as a low-cost replacement to Google Pub/Sub during development and for
non-HA configurations.

## Screenshot

A screenshot of the statistics page:

![Statistics Page Example](/screenshot.png?raw=true "Statistics Page")

## Usage

You can run this server like this:

```
node index.js
```

The main server listens on port 8000.  It accepts requests to all endpoints.

A statistics-only server listens on port 8001.  This will only respond to endpoint which provide statistics
(`/stats.json` and `/stats`).  This allows you to safely expose port 8001 as a dashboard to the public web,
while keeping port 8000 internal to your network.

## Configuration

Currently the Pub/Sub server supports the following environment variables, which change it's behaviour:

### MAX_MESSAGE_STORAGE

When the `MAX_MESSAGE_STORAGE` environment variable is set, this defines the maximum number of messages to keep in-memory
for a given client.  To ensure that the server does not run out of available memory, this option defaults to 1000 messages
per client.

When the queue of unacked messages for a client exceeds `MAX_MESSAGE_STORAGE`, the Pub/Sub server will start dropping the
oldest messages.

You can set `MAX_MESSAGE_STORAGE` to `0` to indicate that there is no maximum to the number of messages (this prevents any
messages from ever being dropped due to queue size).

## Accessing Statistics

To diagnose the operation of the Pub/Sub server, you can visit the `/stats` URL which will show you graphs regarding the
minute-by-minute running of the server.  This is useful if you need to diagnose why a client isn't receiving messages, and
can function as a dashboard to alert you of any services that are no longer processing messages.

## Client API

Clients should make requests to one of the following endpoints:

 - `GET /poll?clientName=...`
 - `GET /ack?clientName=...&messageId=...`
 - `PUT /publish`

### GET /poll

Parameters:
  - **clientName**: The name for the client.  If multiple requests are made with the same
    client name, each new message will only be dispatched to one client.  This allows you to
    have clients configured in a high availability configuration, and only one client will
    receive the new message.

This endpoint either returns an immediate message for the client, or initiates a long poll.

Request Example:

```
curl http://localhost:8000/poll?clientName=my-client
```

Return Example:

```
{"result":true,"message":"test","messageId":"56f87e03-e67e-4dc6-9f5e-75562bebff51"}
```

### GET /ack

Parameters:
  - **clientName**: The name of the client to ack the message for.
  - **messageId**: The message ID that was provided by `/poll`.

Acknowledges a message as processed for the given client.  You need to call this method within 60 seconds
of the message being retrieved from `/poll`, or the message will be requeued for the client (and potentially
dispatched to other long polls using the same client name).

Request Example:

```
curl 'http://localhost:8000/ack?clientName=my-client&messageId=846eec6d-8608-4789-be4c-05d41b2d186d'
```

Return Example:

```
{"result":true}
```

### PUT /publish

The body of the PUT requests forms the message.  The message is dispatched to all known client names (that is, you must
call `/poll` at least once for a message to be dispatched to that client name).

Request Example:

```
curl -X PUT --data "test" http://localhost:8000/publish
```

Return Example:

```
{"result":true,"messageId":"56f87e03-e67e-4dc6-9f5e-75562bebff51"}
```

### GET /stats.json

Retrieves statistics about the operation of the Pub/Sub server.  The format of the result of this endpoint may change
in the future.  This endpoint is used by the `/stats` page.