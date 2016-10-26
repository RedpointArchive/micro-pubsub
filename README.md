# micro-pubsub

An in-memory Pub/Sub server that supports explicit acknowledgements and shared client IDs.

This server was written as a low-cost replacement to Google Pub/Sub during development and for
non-HA configurations.

## Usage

You can run this server like this:

```
node index.js
```

It listens on port 8000.

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