.PHONY: dev install test seed clean

dev:
	@bash run.sh

install:
	@python -m venv backend/venv
	@backend/venv/bin/pip install -r backend/requirements.txt
	@cd frontend && npm install

seed:
	@cd data-generator && python generate.py

test:
	@backend/venv/bin/pytest backend/tests

clean:
	@rm -rf backend/venv frontend/node_modules frontend/dist
