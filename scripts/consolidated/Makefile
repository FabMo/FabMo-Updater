#
# Consolidated build Makefile
#
# This script builds a consolidated engine/updater package by pulling the latest
# package of the specfied type from github and bundling it in the consolidated 
# build container.
#
# To use:
#
# make      - Builds from the latest release
# make rc   - Builds from the latest rc
# make dev  - Builds from the latest dev
#

release : MANIFEST_URL=http://fabmo.github.io/manifest/packages.json
release	: rename

rc : MANIFEST_URL=http://fabmo.github.io/manifest/packages-rc.json
rc : rename

dev : MANIFEST_URL=http://fabmo.github.io/manifest/packages-dev.json
dev : rename

rename : build/container.fmp
	mv build/container.fmp build/`cat dl/version`

build/container.fmp: cleartmp build/consolidated.fmp
	cd tmp; \
	cp ../files/container.json ./manifest.json; \
	cp ../files/install ../files/do-consolidated-update.sh ../files/server.js ../build/consolidated.fmp ../files/fabmo-temp-updater.service .; \
	tar -cvzf updater-stub.tar.gz server.js; \
	tar -cvzf consolidated.tar.gz consolidated.fmp; \
	tar -cvzf service.tar.gz fabmo-temp-updater.service; \
	cp ../files/fabmo-temp-updater-old.service ./fabmo-temp-updater.service; \
	tar -cvzf ../build/container.fmp updater-stub.tar.gz manifest.json consolidated.tar.gz service.tar.gz install do-consolidated-update.sh fabmo-temp-updater.service
	rm build/consolidated.fmp

dl/engine.fmp dl/updater.fmp: 
	mkdir -p dl
	node fetch.js $(MANIFEST_URL)

engine.tar.gz: cleartmp dl/engine.fmp
	cd tmp; \
	tar -xvzf ../dl/engine.fmp; \
	mv files.tar.gz ../engine.tar.gz ;\
	mv g2.bin ../; \
	rm ../dl/engine.fmp;

updater.tar.gz: cleartmp dl/updater.fmp
	cd tmp; \
	tar -xvzf ../dl/updater.fmp; \
	mv files.tar.gz ../updater.tar.gz; \
	rm ../dl/updater.fmp;

token.tar.gz: cleartmp
	cd tmp; \
	touch install_token; \
	tar -cvzf token.tar.gz install_token; \
	mv token.tar.gz ..

build/consolidated.fmp: cleartmp token.tar.gz updater.tar.gz engine.tar.gz g2.bin files/consolidated.json
	mkdir -p build
	cd tmp; \
	mv ../engine.tar.gz .; \
	mv ../updater.tar.gz .; \
	mv ../token.tar.gz .; \
	cp ../g2.bin .; \
	cp ../files/consolidated.json ./manifest.json; \
	tar -cvzf ../build/consolidated.fmp engine.tar.gz updater.tar.gz g2.bin manifest.json token.tar.gz 

cleartmp:
	mkdir -p tmp
	rm -rf tmp/*

clean:
	rm -rf tmp dl engine.tar.gz updater.tar.gz token.tar.gz g2.bin build
	
.PHONY: cleartemp clean rc dev release rename
