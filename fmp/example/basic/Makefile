all: release
	
release: basic.fmp
	cp basic.fmp ../../../static

basic.fmp: manifest.json dummy.tar.gz g2.bin
	tar -cvzf basic.fmp manifest.json dummy.tar.gz

dummy.tar.gz:
	touch engine.file
	mkdir engine.dir
	tar -cvzf dummy.tar.gz engine.file engine.dir g2.bin
	rm -rf engine.file engine.dir

.PHONY: release
