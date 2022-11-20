# python3 webserver
from http.server import BaseHTTPRequestHandler, HTTPServer
import datetime

hostName = "localhost"
serverPort = 8080

DATA_PATH = "kv"
SECRET_KEY = "q3049fagawq4b09qa45nab0hfsefSDGNOWEGwebowebiegae4g904a5gnaerg"


class Category(object):
    HOUSE_SALE = 'houses-sale'
    APPARTMENTS_SALE = 'appartments-sale'
    APPARTMENTS_RENT = 'appartments-rent'


class MyServer(BaseHTTPRequestHandler):
    def getJsonForDate(self, date: datetime.date, category):
        name = f"{date.isoformat()}_{category}"
        with open(f"{DATA_PATH}/{name}/{name}.json") as data_file:
            return data_file.read()

    def getLastJson(self, category: Category):
        today = datetime.date.today()
        try:
            return self.getJsonForDate(today, category)
        except FileNotFoundError:
            return self.getJsonForDate(today - datetime.timedelta(days=1), category)

    def sendResponse(self, category):
        # self.wfile.write(bytes("%s" % self.path, "utf-8"))
        self.wfile.write(bytes(self.getLastJson(category), 'utf-8'))
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()

    def do_GET(self):
        if self.path == f"/{SECRET_KEY}/{Category.HOUSE_SALE}":
            self.sendResponse(Category.HOUSE_SALE)
        elif self.path == f"/{SECRET_KEY}/{Category.APPARTMENTS_SALE}":
            self.sendResponse(Category.APPARTMENTS_SALE)
        elif self.path == f"/{SECRET_KEY}/{Category.APPARTMENTS_RENT}":
            self.sendResponse(Category.APPARTMENTS_RENT)


if __name__ == "__main__":
    webServer = HTTPServer((hostName, serverPort), MyServer)
    print("Server started http://%s:%s" % (hostName, serverPort))

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")
