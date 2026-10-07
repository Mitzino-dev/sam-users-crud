.PHONY: build build-UsersFunction

build: build-UsersFunction

# Objetivo que invoca SAM CLI (BuildMethod: makefile) para la funcion UsersFunction.
# El bundle de esbuild es autocontenido, por lo que solo se publica dist/.
build-UsersFunction:
	npm run build
	mkdir -p $(ARTIFACTS_DIR)
	cp -R dist $(ARTIFACTS_DIR)/dist