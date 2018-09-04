build/container.fmp: cleartmp build/consolidated.fmp
	cd tmp; \
	cp ../files/container.json ./manifest.json; \
	cp ../files/server.js ../build/consolidated.fmp ../files/fabmo-temp-updater.service .; \
	tar -cvzf updater-stub.tar.gz server.js; \
	tar -cvzf consolidated.tar.gz consolidated.fmp; \
	tar -cvzf service.tar.gz fabmo-temp-updater.service; \
	tar -cvzf ../build/container.fmp updater-stub.tar.gz manifest.json consolidated.tar.gz service.tar.gz

dl/engine.fmp dl/updater.fmp: 
	mkdir -p dl
	node fetch.js

engine.tar.gz: cleartmp dl/engine.fmp
	cd tmp; \
	tar -xvzf ../dl/engine.fmp; \
	mv files.tar.gz ../engine.tar.gz ;\
	mv g2.bin ../

updater.tar.gz: cleartmp dl/updater.fmp
	cd tmp; \
	tar -xvzf ../dl/updater.fmp; \
	mv files.tar.gz ../updater.tar.gz

token.tar.gz: cleartmp
	cd tmp; \
	touch install_token; \
	tar -cvzf token.tar.gz install_token; \
	mv token.tar.gz ..

build/consolidated.fmp: cleartmp token.tar.gz updater.tar.gz engine.tar.gz g2.bin files/consolidated.json
	mkdir -p build
	cd tmp; \
	cp ../engine.tar.gz .; \
	cp ../updater.tar.gz .; \
	cp ../token.tar.gz .; \
	cp ../g2.bin .; \
	cp ../files/consolidated.json ./manifest.json; \
	tar -cvzf ../build/consolidated.fmp engine.tar.gz updater.tar.gz g2.bin manifest.json token.tar.gz 

cleartmp:
	mkdir -p tmp
	rm -rf tmp/*

clean:
	rm -rf tmp dl engine.tar.gz updater.tar.gz token.tar.gz g2.bin build
.PHONY: cleartemp clean
