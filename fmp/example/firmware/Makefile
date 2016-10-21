all: firmware.fmp

clean:
	rm *.fmp

firmware.fmp: firmware/manifest.json
	cd firmware; tar -cvzf ../firmware.fmp manifest.json

.PHONY: clean
