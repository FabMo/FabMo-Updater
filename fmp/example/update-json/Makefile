all: release
	
release: json.fmp
	cp json.fmp ../../../static

json.fmp: manifest.json abc.tar.gz
	tar -cvzf json.fmp manifest.json

.PHONY: release
