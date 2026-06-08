import React, { memo } from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';

function TradingViewChartComponent() {
  return (
    <div style={{ height: "100%", width: "100%", position: "absolute", top: 0, left: 0 }}>
      <AdvancedRealTimeChart
        symbol="BINANCE:BTCUSDT"
        theme="dark"
        interval="5"
        autosize
        allow_symbol_change={false}
        hide_legend
        hide_top_toolbar
        hide_side_toolbar
        save_image={false}
        backgroundColor="rgba(24, 26, 32, 1)"
        gridColor="rgba(255, 255, 255, 0.05)"
      />
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartComponent);
