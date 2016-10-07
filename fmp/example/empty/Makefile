all: empty-engine.fmp empty-updater.fmp

clean:
	rm *.fmp

empty-engine.fmp: engine/manifest.json
	cd engine
	tar -cvzf ../empty-engine.fmp manifest.json
empty-updater.fmp: updater/manifest.json
	cd updater
	tar -cvzf ../empty-updater.fmp manifest.json

.PHONY clean
