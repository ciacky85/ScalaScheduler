# ODG Scraper 2.3 — JSON tabellare

## Build
docker build --no-cache -t odg-scraper:2.3 --build-arg BUILD_TS=$(date +%s) .

## Run
mkdir -p data
cp config.json.example data/config.json
docker run -d --name odg-scraper-2_3 -e TZ=Europe/Rome -v "$PWD/data:/data" odg-scraper:2.3
docker logs -f odg-scraper-2_3

Output di default: /data/odg_structured.json
