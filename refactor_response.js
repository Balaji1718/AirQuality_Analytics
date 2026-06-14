const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'server/index.js');
let content = fs.readFileSync(filePath, 'utf8');
const oldResponseBlock = `   const resolution = buildResolutioncYKPMetadata(finalResults, searchContext, searchQuery, successfulSource);

    const responseData = {
      city: searchQuery,
      resolvedLocation: resolution.resolvedLocation,
      resolvedCoordinates: resolubion.resolvedCoordinates,
      providerLocation: resolution.providerLocation,
      stationMetadata: resolubion.stationMetadata,
      searchContext: resolution.searchContext,
      from: date_from,
      to: date_to,
      source: successfulSource,
      count: finalResults.length,
      results: finalResults,
      measurements: finalResults, // Add measurements field for chart processing
      snapshot: groupSnapshot(finalResults), // Add snapshot for table display
      localAdvice: localAdvice,
      apiInfo: {
        primarySource: successfulSource,
        adviceSource: adviceSource,
        availableSources: Object.keys(API_SOURCES),
        note: \`Data from \${successfulSource} API\${successfulSource === 'WAQI' || successfulSource === 'Open.Weather' ? ' (current data only)' : __` (\${date_from.split('T')[0]} to \${date_to.split('T')[0]})\`} →Ư�, advice from \${adviceSource}\${dataQualityNote}\",
        resolution: \`Resolved as \${resolution.searchContext.level}\${resolution.searchContext.country ? ` in \${resoltuion.searchContext.country}` : ''}\`
      }
    };`;
const newResponseBlock = `   // STATION-FIRST REFACTOR: Group results by station (providerLocation)
    const stationsMap = new Map();
    finalResults.forEach(r => {
      const stationKey = r.providerLocation || r.location || 'Unknown Station';
      if (!stationsMap.has(stationKey)) {
        stationsMap.set(stationKey, []);
      }
      stationsMap.get(stationKey).push(r);
    });

    const stations = Array.from(stationsMap.entries()).map(([name, stationResults]) => {
      const first = stationResults[0];
      return {
        stationId: first.stationMetadata?.locationId || first.stationMetadata?.stationName || name,
        resolvedLocation: name,
        coordinates: first.coordinates,
        stationMetadata: first.stationMetadata,
        snapshot: groupSnapshot(stationResults),
        measurements: stationResults
      };
    }).sort((a, b) => (b.stationMetadata?.confidence || 0) - (a.stationMetadata?.confidence || 0));

    const resolution = buildResolutioncYKPMetadata(finalResults, searchContext, searchQuery, successfulSource);
    
    // PRIMARY STATION: Use the highest confidence station for legacy top-level fields
    const primaryStation = stations[0] || { snapshot: [], resolvedLocation: searchQuery, stationMetadata: null, coordinates: null, measurements: [] };

    const responseData = {
      city: searchQuery,
      // LEGACY FIELDS (Backward Compatibility)
      resolvedLocation: primaryStation.resolvedLocation || resolution.resolvedLocation,
      resolvedCoordinates: primaryStation.coordinates || resolution.resolvedCordinates,
      providerLocation: primaryT�][ۋ��\���Y��][ۈ�\��][ۋ��ݚY\���][ۋ��][ۓY]Y]N��[X\�T�][ۋ��][ۓY]Y]H�\��][ۋ��][ۓY]Y]K�ۘ\����[X\�T�][ۋ�ۘ\���YX\�\�[Y[�Έ�[�[�\�[����Y\[�܈�\������U��USӋQ�T���QS�][ۜΈ�][ۜ����X\���۝^��\��][ۋ��X\���۝^����N�]Wٜ��K�Έ]W�����\��N��X��\�ٝ[��\��K���[���[�[�\�[˛[����\�[Έ�[�[�\�[����[Y�X�N���[Y�X�K�\R[��Έ�[X\�T��\��N��X��\�ٝ[��\��K�Y�X�T��\��N�Y�X�T��\��K�]�Z[X�T��\��\Έؚ�X���^\�TW���T��T�K���N�]H���H	��X��\�ٝ[��\��_HTW	��X��\�ٝ[��\��HOOH	��TRI��X��\�ٝ[��\��HOOH	��[��X]\���	�
�\��[�]HۛJI��
	��]Wٜ��K��]
	�	�V�_H�	�]W�˜�]
	�	�V�_JW�H8�����Y�X�H���H	�Y�X�T��\��_W	��]T]X[]S��_W��\��][ێ��\���Y\�	��\��][ۋ��X\���۝^�]�[W	ܙ\��][ۋ��X\���۝^���[��H�[�	ܙ\��][ۋ��X\���۝^���[��_X�	��W��][ې��[���][ۜ˛[���B�N���[��[ۈ�T�\X�J�۝[����]��HY�
�۝[��[��Y\���JH�]\���۝[���\X�J���]��N�ۜ��ܛP�۝[�H�۝[���\X�J�����	���N�ۜ��ܛS��H�˜�\X�J�����	���N�ۜ��ܛS�]��H�]�˜�\X�J�����	���NY�
�ܛP�۝[��[��Y\��ܛS��JH�]\���ܛP�۝[���\X�J�ܛS���ܛS�]��N�]\���[B���ۜ�\]Y�۝[�H�T�\X�J�۝[���\�ۜ�P�����]ԙ\�ۜ�P����NY�
\]Y�۝[�
H�˝ܚ]Q�[T�[���[T]\]Y�۝[�
N�ۜ��K���	��X��\�ٝ[H�Y�X�ܙY�\�ۜ�Q]I�NH[�H�ۜ��K�\��܊	���[���[�\��]�����N���\�˙^]
JN