'use strict';

let http = require('http');
let uuid = require('uuid');
let url = require('url');

let clients = {};

function wakeClient(clientName) {
  for (let i in clients[clientName].longPolls) {
    if (clients[clientName].longPolls.hasOwnProperty(i)) {
      clients[clientName].longPolls[i]();
    }
  }
}

function wakeAllClients() {
  for (let i in clients) {
    if (clients.hasOwnProperty(i)) {
      wakeClient(i);
    }
  }
}

function unreserve(clientName, messageId) {
  console.log('unreserve: pushed message ' + messageId + ' back in the queue for ' + clientName);
  clients[clientName].unackedMessages[messageId] =
    clients[clientName].reservedMessages[messageId].message;
  clients[clientName].unackedMessageOrder.push(messageId);
  wakeClient(clientName);
}

function handleAck(clientName, messageId, callback) {
  if (clients[clientName].reservedMessages[messageId] === undefined) {
    callback(new Error('message reservation timed out'));
    return;
  }

  console.log('ack: acked message ' + messageId + ' for client ' + clientName);
  clearTimeout(clients[clientName].reservedMessages[messageId].timeout);
  delete clients[clientName].reservedMessages[messageId];
  callback();  
}

function ack(req, res) {
  let clientName = req.url.query.clientName;
  let messageId = req.url.query.messageId;

  handleAck(clientName, messageId, (err) => {
    if (err) {
      res.writeHead(500, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        result: false,
        error: 'internal server error: ' + err.message 
      }));
      return;
    }

    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      result: true
    }));
  });
}

function dequeue(clientName, callback) {
  let messageId = clients[clientName].unackedMessageOrder[0];
  if (clients[clientName].unackedMessages[messageId] === undefined) {
    clients[clientName].unackedMessageOrder.shift();
    callback(new Error('missing message ' + messageId), null, null);
    return;
  }

  clients[clientName].reservedMessages[messageId] = {
    message: clients[clientName].unackedMessages[messageId],
    timeout: setTimeout(() => unreserve(clientName, messageId), 1000 * 60)
  };
    
  delete clients[clientName].unackedMessages[messageId];
  clients[clientName].unackedMessageOrder.shift();

  console.log('dequeue: dequeuing message ' + messageId);
  callback(
    null,
    messageId,
    clients[clientName].reservedMessages[messageId].message);
}

function poll(req, res) {
  let clientName = req.url.query.clientName;

  if (clients[clientName] === undefined) {
    clients[clientName] = {
      unackedMessages: {},
      reservedMessages: {},
      unackedMessageOrder: [],
      longPolls: {}
    };
  }

  if (clients[clientName].unackedMessageOrder.length > 0) {
    console.log('poll: immediately dequeuing message');

    // return immediately the next message
    dequeue(clientName, (err, messageId, messageData) => {
      if (err) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          result: false,
          error: 'internal server error: ' + err.message 
        }));
        return;
      }

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        result: true,
        message: messageData,
        messageId: messageId
      }));
    });
    return;
  }

  // create a long poll session id
  let longPollSessionId = uuid.v4();

  // track if the request disconnects.
  let clientDisconnected = false;
  req.on("close", function() {
    console.log('long poll: client disconnected');
    clientDisconnected = true;
    delete clients[clientName].longPolls[longPollSessionId];
  });
  req.on("end", function() {
    console.log('long poll: client disconnected');
    clientDisconnected = true;
    delete clients[clientName].longPolls[longPollSessionId];
  });

  // define our handler when a new message arrives.
  function awaken() {
    console.log('long poll: awoken by new message');

    // delete ourselves from the long poll
    delete clients[clientName].longPolls[longPollSessionId];

    // if the client is disconnected, bail
    if (clientDisconnected) {
      console.log('long poll: client disconnected (skipping awake)');
      return;
    }

    if (clients[clientName].unackedMessageOrder.length == 0) {
      // someone else handled the message, re-enter ourselves
      // to the long poll
      console.log('long poll: missed message');
      clients[clientName].longPolls[longPollSessionId] = () => { awaken() };
      return;
    } 

    // we should dispatch this message.
    console.log('long poll: dequeuing message');
    dequeue(clientName, (err, messageId, messageData) => {
      if (err) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          result: false,
          error: 'internal server error: ' + err.message 
        }));
        return;
      }

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        result: true,
        message: messageData,
        messageId: messageId
      }));
    });
    return;
  }

  console.log('poll: entering long poll');

  // add awaken handler to long polls.
  clients[clientName].longPolls[longPollSessionId] = () => { awaken() };
}

function publish(req, res) {
  let body = [];
  req.on('data', function(chunk) {
    body.push(chunk);
  }).on('end', function() {
    body = Buffer.concat(body).toString();

    let messageId = uuid.v4();

    for (let i in clients) {
      if (clients.hasOwnProperty(i)) {
        clients[i].unackedMessages[messageId] = body;
        clients[i].unackedMessageOrder.push(messageId);
      }
    }

    wakeAllClients();

    console.log('publish: published message ' + messageId);

    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      result: true,
      messageId: messageId
    }));
  });
}

function handleRequest(req, res) {
  req.url = url.parse(req.url, true);

  if (req.url.pathname == '/poll') {
    poll(req, res);
    return;
  }

  if (req.url.pathname == '/ack') {
    ack(req, res);
    return;
  }

  if (req.url.pathname == '/publish') {
    publish(req, res);
    return;
  }

  res.writeHead(404, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    result: false,
    error: 'endpoint not found' 
  }));
}

let server = http.createServer(handleRequest);
server.listen(8000, () => {
  console.log('pub/sub server listening on port 8000');
});