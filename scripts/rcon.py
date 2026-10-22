"""Local validation console helper; never exposed by the HTTP gateway."""
import socket, struct, sys
def packet(sock):
    def read(n):
        value=b''
        while len(value)<n:
            part=sock.recv(n-len(value))
            if not part: raise ConnectionError('RCON closed')
            value+=part
        return value
    length=struct.unpack('<i',read(4))[0]
    if length<10 or length>4*1024*1024:raise ValueError('Invalid RCON packet length')
    value=read(length)
    return struct.unpack('<ii',value[:8]),value[8:-2].decode('utf-8')
def call(command):
    def send(s,i,t,text):
        p=struct.pack('<ii',i,t)+text.encode('utf-8')+b'\0\0'
        s.sendall(struct.pack('<i',len(p))+p)
    with socket.create_connection(('127.0.0.1',27099),timeout=4) as s:
        send(s,1,3,'local-validation-only')
        while True:
            (i,t),_=packet(s)
            if i==-1:raise PermissionError('RCON authentication failed')
            if t==2:break
        send(s,2,2,command)
        return packet(s)[1]
if __name__=='__main__':print(call(sys.argv[1]))
