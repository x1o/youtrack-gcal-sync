#! /usr/bin/env sh
npm install
npm run build
rm -f dist.zip youtrack-gcal-sync.zip
cd dist
zip -r ../youtrack-gcal-sync.zip *
cd ..
