import { TD, TR, Table } from '@ag-media/react-pdf-table';
import { StyleSheet, Text, View } from '@react-pdf/renderer';

import { parseSnapshot } from '../../doc-editor/components/custom-blocks/spreadsheetSnapshot';
import { DocsExporterPDF } from '../types';

const styles = StyleSheet.create({
  caption: { fontSize: 9, color: '#555555', marginBottom: 3 },
  table: { border: '0.5pt solid #bbbbbb' },
  cell: { paddingHorizontal: 4, paddingVertical: 2, fontSize: 10 },
  header: { fontWeight: 'bold', backgroundColor: '#f1f3f5' },
});

/** The document's copy of a KherveCELL table. */
export const blockMappingSpreadsheetPDF: DocsExporterPDF['mappings']['blockMapping']['spreadsheet'] =
  (block) => {
    const snapshot = parseSnapshot(block.props.snapshot);
    if (!snapshot || !snapshot.columns.length) {
      return <Text>{block.props.name}</Text>;
    }
    return (
      <View style={{ marginVertical: 4 }}>
        {block.props.name && (
          <Text style={styles.caption}>{block.props.name}</Text>
        )}
        <Table style={styles.table}>
          <TR>
            {snapshot.columns.map((column, index) => (
              <TD key={index} style={[styles.cell, styles.header]}>
                <Text>{column}</Text>
              </TD>
            ))}
          </TR>
          {snapshot.rows.map((row, rowIndex) => (
            <TR key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <TD key={cellIndex} style={styles.cell}>
                  <Text>{cell}</Text>
                </TD>
              ))}
            </TR>
          ))}
        </Table>
      </View>
    );
  };
