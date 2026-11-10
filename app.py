"""DeutschMaster entry point: python app.py  ->  http://127.0.0.1:5000"""
from backend import create_app
from backend.config import Config

app = create_app()

if __name__ == "__main__":
    print(f"DeutschMaster ishga tushdi: http://{Config.HOST}:{Config.PORT}")
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
