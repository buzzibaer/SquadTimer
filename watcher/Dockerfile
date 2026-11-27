FROM python:3.12-alpine
WORKDIR /app
COPY watcher/__init__.py watcher/log_parser.py watcher/server.py ./
ENV SQUAD_LOG_DIR=/logs
EXPOSE 8765
CMD ["python", "server.py"]
