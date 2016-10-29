'use strict';

let fs = require('fs');

let clients = null;

let itemsInMemoryHistory = [];
let itemsInMemoryKnownClients = [];

let messagePublishedCount = 0;
let messagePulledCount = {};
let messageAckedCount = {};
let messageUnreservedCount = {};
let messageDroppedCount = {};

let sampleCount = 0;

function renderJson(req, res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({
    itemsInMemoryHistory: itemsInMemoryHistory,
    itemsInMemoryKnownClients: itemsInMemoryKnownClients,
    sampleCount: sampleCount
  }));
}

function renderHtml(req, res) {
  fs.readFile(__dirname + '/stats.htm', 'utf8', (err, data) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(data);
  });
}

function sample() {
  if (itemsInMemoryHistory.length > 60) {
    itemsInMemoryHistory.shift();
  }

  let sampleSet = {};

  for (let k in clients){ 
    if (clients.hasOwnProperty(k)) {

      // Make sure we have a list of all known clients
      // for when we render graphs.
      if (itemsInMemoryKnownClients.indexOf(k) == -1) {
        itemsInMemoryKnownClients.push(k);
      }

      let rc = 0;
      for (let r in clients[k].reservedMessages) {
        if (clients[k].reservedMessages.hasOwnProperty(r)) {
          rc++;
        }
      }

      sampleSet[k] = {
        unackedMessageInMemoryCount: clients[k].unackedMessageOrder.length,
        reservedMessageInMemoryCount: rc,
        pulledOperationsCount: messagePulledCount[k] === undefined ? 0 : messagePulledCount[k],
        ackedOperationsCount: messageAckedCount[k] === undefined ? 0 : messageAckedCount[k],
        unreservedOperationsCount: messageUnreservedCount[k] === undefined ? 0 : messageUnreservedCount[k],
        droppedOperationsCount: messageDroppedCount[k] === undefined ? 0 : messageDroppedCount[k],
      };

      messagePulledCount[k] = 0;
      messageAckedCount[k] = 0;
      messageUnreservedCount[k] = 0;
      messageDroppedCount[k] = 0;
    }
  }

  itemsInMemoryHistory.push({
    publishOperationsCount: messagePublishedCount,
    clients: sampleSet,
  });

  messagePublishedCount = 0;

  sampleCount++;
}

function start(clientsGlob) {
  clients = clientsGlob;
  setInterval(sample, 60000);
}

function messagePublished() {
  messagePublishedCount++;
}

function messagePulled(clientName) {
  if (messagePulledCount[clientName] === undefined) {
    messagePulledCount[clientName] = 0;
  }

  messagePulledCount[clientName]++;
}

function messageAcked(clientName) {
  if (messageAckedCount[clientName] === undefined) {
    messageAckedCount[clientName] = 0;
  }
  
  messageAckedCount[clientName]++;
}

function messageUnreserved(clientName) {
  if (messageUnreservedCount[clientName] === undefined) {
    messageUnreservedCount[clientName] = 0;
  }
  
  messageUnreservedCount[clientName]++;
}

function messageDropped(clientName) {
  if (messageDroppedCount[clientName] === undefined) {
    messageDroppedCount[clientName] = 0;
  }
  
  messageDroppedCount[clientName]++;
}

module.exports = {
  renderJson: renderJson,
  renderHtml: renderHtml,
  start: start,
  messagePublished: messagePublished,
  messagePulled: messagePulled,
  messageAcked: messageAcked,
  messageUnreserved: messageUnreserved,
  messageDropped: messageDropped
};
