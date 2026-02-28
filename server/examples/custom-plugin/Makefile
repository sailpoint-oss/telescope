.PHONY: build clean install

BINARY = telescope-plugin-example

build:
	go build -o $(BINARY) .

clean:
	rm -f $(BINARY)

install: build
	@echo "Copy $(BINARY) to your project's .telescope/plugins/ directory"
	@echo "  mkdir -p /path/to/project/.telescope/plugins"
	@echo "  cp $(BINARY) /path/to/project/.telescope/plugins/"
