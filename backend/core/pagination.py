from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    # This was 200. Several screens load "everything" for a dropdown or picker
    # by asking for page_size=500 (Messaging unit picker, Quick Reading,
    # Units/Billing filters…). DRF silently trims a request above the maximum,
    # so those screens only ever received the first 200 rows and the rest were
    # simply missing from their lists. 1000 makes those existing requests work
    # as written; the Messaging picker additionally walks every page, so it
    # no longer depends on this limit at all.
    max_page_size = 1000

    def get_paginated_response(self, data):
        return Response({
            'count':       self.page.paginator.count,
            'next':        self.get_next_link(),
            'previous':    self.get_previous_link(),
            # Additive fields — existing clients that only read
            # count/next/previous/results are unaffected.
            'page_size':   self.page.paginator.per_page,
            'total_pages': self.page.paginator.num_pages,
            'results':     data,
        })


class LargePagination(PageNumberPagination):
    page_size = 100
    max_page_size = 500