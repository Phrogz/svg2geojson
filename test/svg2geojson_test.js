var expect = require('chai').expect
const svg2geojson = require('../lib/svg2geojson.js');

describe('svg2geojson', () => {

  describe('#geoFromSVGXML()', () => {

    describe('Rectangle', () => {
      function generateRectangleWithMeta(mappingObject) {
        const { long1, long2, long3, lat1, lat2, lat3 } = mappingObject;

        return `
        <svg>
          <MetaInfo xmlns="http://www.prognoz.ru">
            <Geo>
              <GeoItem X="0" Y="0" Longitude="${long1}" Latitude="${lat1}" />
              <GeoItem X="0" Y="1" Longitude="${long2}" Latitude="${lat2}" />
              <GeoItem X="2" Y="1" Longitude="${long3}" Latitude="${lat3}" />
            </Geo>
          </MetaInfo>
          <g>
            <rect width="2" height="1" x="0" y="0" />
          </g>
        </svg>
        `;
      }

      function generateExpectedGeoJSON(coordinates){
        return {
          type: 'FeatureCollection',
          creator: 'svg2geojson v0.7.0',
          features: [{
            type: 'Feature',
            properties: null,
            geometry: {
              type: 'Polygon',
              coordinates,
            }
          }]
        }
      }

      it('should scale linearly', (done) => {
        const svg = generateRectangleWithMeta({
          long1: 0, lat1: 0,
          long2: 0, lat2: 2,
          long3: 4, lat3: 2,
        });
        svg2geojson.geoFromSVGXML(
          svg,
          (geojson) => {
            const expected = generateExpectedGeoJSON([[[0, 0], [0, 2], [4, 2], [4, 0], [0, 0]]]);
            expect(geojson).to.deep.equal(expected);
            done();
          }
        );
      });

      it('should translate', (done) => {
        const svg = generateRectangleWithMeta({
          long1: 1, lat1: 1,
          long2: 1, lat2: 2,
          long3: 3, lat3: 2,
        });
        svg2geojson.geoFromSVGXML(
          svg,
          (geojson) => {
            const expected = generateExpectedGeoJSON([[[1, 1], [1, 2], [3, 2], [3, 1], [1, 1]]]);
            expect(geojson).to.deep.equal(expected);
            done();
          }
        );
      });

      it('should rotate 90 degrees clockwise around origin (0,0)', (done) => {
        const svg = generateRectangleWithMeta({
          long1: 0, lat1: 0,
          long2: 1, lat2: 0,
          long3: 1, lat3: -2,
        });
        svg2geojson.geoFromSVGXML(
          svg,
          (geojson) => {
            const expected = generateExpectedGeoJSON([[[0, 0], [1, 0], [1, -2], [0, -2], [0, 0]]]);
            expect(geojson).to.deep.equal(expected);
            done();
          }
        );
      });
    });
  });
});

