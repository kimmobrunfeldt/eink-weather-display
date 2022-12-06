#!/bin/bash


function usage() {
  echo "Usage: $0 [-l true/false]" 1>&2
  echo -e "\nExample: use local log files instead of fetching from GCP" 1>&2
  echo "   \$ $0 -l true" 1>&2
  exit 1
}

USE_LOCAL_LOGS=false

while getopts "l:" opt; do
    case "${opt}" in
        l)
            USE_LOCAL_LOGS=${OPTARG}
            if [[ "$USE_LOCAL_LOGS" != "true" && "$USE_LOCAL_LOGS" != "false" ]]; then
              echo "Error: -l must be 'true' or 'false'. Got '$USE_LOCAL_LOGS'" 1>&2
              exit 1
            fi
            ;;
        *)
            usage
            ;;
    esac
done
shift $((OPTIND - 1))

set -x

LOG_QUERY_LEVEL="-logName=\"projects/weather-display-367406/logs/cloudbuild\" logName=\"projects/weather-display-367406/logs/python\" \"Charge level:\""
LOG_QUERY_VOLTAGE="-logName=\"projects/weather-display-367406/logs/cloudbuild\" logName=\"projects/weather-display-367406/logs/python\" GetBatteryVoltage"
LOG_QUERY_TEMPERATURE="-logName=\"projects/weather-display-367406/logs/cloudbuild\" logName=\"projects/weather-display-367406/logs/python\" GetBatteryTemperature"

if [ "$USE_LOCAL_LOGS" != "true" ]; then
  gcloud logging read "$LOG_QUERY_LEVEL" --limit 1000 --freshness 60d --format json --project weather-display-367406 > .temp-logs-level.json
  gcloud logging read "$LOG_QUERY_VOLTAGE" --limit 1000 --freshness 60d --format json --project weather-display-367406 > .temp-logs-voltage.json
  gcloud logging read "$LOG_QUERY_TEMPERATURE" --limit 1000 --freshness 60d --format json --project weather-display-367406 > .temp-logs-temperature.json
fi

JQ_COMMAND='.[] | [.timestamp, (.textPayload | match(".*data.: ([0-9]+).*") | .captures[0].string)] | @tsv'
jq -r "$JQ_COMMAND" .temp-logs-level.json > .temp-data-level.tsv
jq -r "$JQ_COMMAND" .temp-logs-voltage.json > .temp-data-voltage.tsv
jq -r "$JQ_COMMAND" .temp-logs-temperature.json > .temp-data-temperature.tsv

gnuplot -p -e '
  set autoscale;
  set xdata time;
  set timefmt "%Y-%m-%dT%H:%M:%SZ";
  set format x "%d.%m.\n%H:%M";
  set xrange [time(0) - 3600 * 24 * 21:time(0) + 3600 * 24 * 200];


  set style data lines;
  set style line 1 linewidth 2 linecolor "#00FF00" pointtype 7 pointsize 0.5;
  set style line 2 linewidth 2 linecolor "#9900FF" pointtype 7 pointsize 0.5;
  set style line 3 linewidth 2 linecolor "#FF0000" pointtype 7 pointsize 0.5;
  set style fill transparent solid 0.1 noborder;
  set grid;
  set bmargin 2;
  set lmargin 10;
  set rmargin 10;
  set tmargin 2;

  set datafile separator "\t";
  set terminal pngcairo size 2000,1400;
  set output "graph.png";

  set multiplot layout 3,1;

  a = 10e-10;
  f(x) = a*x + b;
  fit [time(0) - 3600 * 24 * 7:*] f(x) ".temp-data-level.tsv" using 1:2 via a, b;

  stddev_y = 10;

  set yr [0:100];
  plot ".temp-data-level.tsv" using 1:2 title "Battery level" linestyle 1 with linespoints,
       [time(0) - 3600 * 24 * 7:] f(x) title "Predicted level",
       [time(0) - 3600 * 24 * 7:] "+" using ($1):(f($1) - stddev_y):(f($1) + stddev_y) with filledcurves title "Confidence interval";
  unset yr;
  plot ".temp-data-voltage.tsv" using 1:2 title "Voltage" linestyle 2 with linespoints;
  set yr [0:80];
  plot ".temp-data-temperature.tsv" using 1:2 title "Temperature" linestyle 3 with linespoints;
  unset yr;
  unset multiplot;
'