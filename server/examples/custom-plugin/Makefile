.PHONY: build clean install build-test-plugins

BINARY = telescope-plugin-example
TEST_FILES_PLUGINS = ../../../test-files/.telescope/plugins

build:
	go build -o $(BINARY) .

clean:
	rm -f $(BINARY)
	rm -f $(TEST_FILES_PLUGINS)/example-rules

install: build
	@echo "Copy $(BINARY) to your project's .telescope/plugins/ directory"
	@echo "  mkdir -p /path/to/project/.telescope/plugins"
	@echo "  cp $(BINARY) /path/to/project/.telescope/plugins/"

build-test-plugins:
	@mkdir -p $(TEST_FILES_PLUGINS)
	go build -o $(TEST_FILES_PLUGINS)/example-rules .
