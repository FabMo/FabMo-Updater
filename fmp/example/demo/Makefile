all: release
	
release: demo.fmp
	cp demo.fmp ../../../static

demo.fmp: manifest.json abc.tar.gz
	tar -cvzf demo.fmp manifest.json abc.tar.gz

abc.tar.gz:
	touch a b c thisFileShouldBeDeleted
	mkdir directory
	tar -cvzf abc.tar.gz a b c thisFileShouldBeDeleted directory
	rm -rf a b c thisFileShouldBeDeleted directory

.PHONY: release
