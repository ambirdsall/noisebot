BASE_URL="http://localhost:5005"
get () {
  curl "${BASE_URL}/$1" | jq .
}

post () {
  curl --json "$2" "${BASE_URL}/$1" | jq .
}


