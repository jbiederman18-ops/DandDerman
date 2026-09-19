import http.server, gzip, sys, os
class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path=self.translate_path(self.path.split('?')[0])
        if not os.path.isfile(path): return super().send_head()
        data=gzip.compress(open(path,'rb').read(),6)
        self.send_response(200)
        ct='text/html' if path.endswith('.html') else 'application/javascript' if path.endswith('.js') else self.guess_type(path)
        self.send_header('Content-Type',ct); self.send_header('Content-Encoding','gzip'); self.send_header('Content-Length',str(len(data))); self.end_headers()
        import io; return io.BytesIO(data)
    def log_message(self,*a): pass
os.chdir(sys.argv[2]); http.server.ThreadingHTTPServer(('',int(sys.argv[1])),H).serve_forever()
