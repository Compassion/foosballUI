// This is the stuff that listens to the FoosBot Node app

socket = new io.Socket('localhost:8000');
socket.connect();

socket.on('message', function(data){
    console.log('Hey, I got a message from FoosBot: ' + data);
});